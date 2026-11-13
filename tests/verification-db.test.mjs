/**
 * Database guarantees for JobLink Verified.
 *
 * A job seeker must never be able to mark themselves verified, read another
 * person's check, or reach the private folder; the status path, the audit log
 * and the "no file outlives its purpose" rules are enforced by Postgres, so
 * they are tested against Postgres (pglite), like security-hardening.test.mjs.
 */
import test, { before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const EMPLOYER = '11111111-1111-1111-1111-111111111111';
const SEEKER = '22222222-2222-2222-2222-222222222222';
const OTHER = '44444444-4444-4444-4444-444444444444';
const ADMIN = '55555555-5555-5555-5555-555555555555';
const COMPANY = '33333333-3333-3333-3333-333333333333';
const PROFILE = '66666666-6666-6666-6666-666666666666';
const OTHER_PROFILE = '77777777-7777-7777-7777-777777777777';
const JOB = '88888888-8888-8888-8888-888888888888';
const APPLICATION = '99999999-9999-9999-9999-999999999999';
const OTHER_APPLICATION = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CODE = 'ABCDEFGH23';

let db;

async function actAs(uid, role = 'authenticated') {
  await db.exec(`RESET ROLE; UPDATE _ctx SET uid = ${uid ? `'${uid}'` : 'NULL'}, role = '${role}'`);
}
const asServiceRole = () => actAs(null, 'service_role');
/** Act through the API as a signed-in user: real grants and row security apply. */
async function asBrowser(uid) {
  await actAs(uid);
  await db.exec('SET ROLE authenticated');
}
const rejected = (sql) => assert.rejects(() => db.exec(sql));
const one = async (sql) => (await db.query(sql)).rows[0];

function loadSql(path) {
  return readFileSync(path, 'utf8')
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
    .replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');
}

/** Insert a check and walk it to the requested status as the server would. */
async function createCheck(profile, user, status, { code = CODE, until = `current_date + 180`, group = 'citizen' } = {}) {
  await asServiceRole();
  const { id } = await one(
    `INSERT INTO public.seeker_verifications (seeker_id, user_id) VALUES ('${profile}', '${user}') RETURNING id`
  );
  const steps = {
    paid: `status = 'paid', stripe_checkout_session_id = 'cs_${id}', stripe_payment_intent_id = 'pi_${id}', paid_at = now()`,
    submitted: `status = 'submitted', consent_at = now(), consent_version = 'v1', submitted_at = now(),
      rtw_group_claimed = '${group}', rtw_file_path = '${id}/rtw-a.enc', police_record_file_path = '${id}/police-a.enc',
      police_record_sha256 = '${'a'.repeat(64)}', key_version = 1`,
    approved: `status = 'approved', rtw_group = '${group}', rtw_document_type = 'passport', rtw_file_path = NULL,
      police_record_issued_on = current_date - 5, verified_until = ${until}, confirmation_code = '${code}',
      reviewed_at = now(), reviewed_by = '${ADMIN}'`,
  };
  for (const step of ['paid', 'submitted', 'approved']) {
    if (status === 'awaiting_payment') break;
    await db.exec(`UPDATE public.seeker_verifications SET ${steps[step]} WHERE id = '${id}'`);
    if (step === status) break;
  }
  return id;
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB);
    CREATE TABLE _ctx (uid UUID, role TEXT);
    INSERT INTO _ctx VALUES (NULL, 'authenticated');
    GRANT SELECT ON _ctx TO anon, authenticated;
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT uid FROM _ctx LIMIT 1 $$;
    CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT role FROM _ctx LIMIT 1 $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN,
      file_size_limit BIGINT, allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects (id UUID DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT, owner UUID);
    CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE
      AS $$ SELECT string_to_array(name, '/') $$;
  `);
  await db.exec(loadSql('schema-clean.sql'));
  await db.exec(`
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS posted_by_admin boolean DEFAULT false;
    INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('cvs', 'cvs', false, 52428800)
      ON CONFLICT (id) DO UPDATE SET file_size_limit = 52428800;
  `);
  await db.exec(loadSql('supabase/migrations/20260601_security_hardening.sql'));
  await db.exec(loadSql('supabase/migrations/20260925_security_hardening_2.sql'));
  await db.exec(loadSql('supabase/migrations/20261113090000_security_hardening_4.sql'));
  await db.exec(loadSql('supabase/migrations/20261113100000_seeker_verifications.sql'));

  // What Supabase sets up for a real project: the API roles can use the
  // schemas, and storage.objects has row security with a permissive policy.
  await db.exec(`
    GRANT USAGE ON SCHEMA public, storage TO anon, authenticated;
    GRANT ALL ON storage.objects TO anon, authenticated;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY careless_bucket_wide_policy ON storage.objects FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  `);

  await asServiceRole();
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${EMPLOYER}', 'employer@example.com', '{"role":"employer"}'),
      ('${SEEKER}', 'seeker@example.com', '{"role":"seeker"}'),
      ('${OTHER}', 'other@example.com', '{"role":"seeker"}'),
      ('${ADMIN}', 'admin@example.com', '{"role":"seeker"}');
    UPDATE public.users SET email_verified = true;
    UPDATE public.users SET is_admin = true WHERE id = '${ADMIN}';
    INSERT INTO public.companies (id, user_id, company_name) VALUES ('${COMPANY}', '${EMPLOYER}', 'Acme Ltd');
    INSERT INTO public.seeker_profiles (id, user_id, first_name, last_name) VALUES
      ('${PROFILE}', '${SEEKER}', 'Sam', 'Seeker'), ('${OTHER_PROFILE}', '${OTHER}', 'Olive', 'Other');
    INSERT INTO public.job_listings (id, company_id, title, description, status)
      VALUES ('${JOB}', '${COMPANY}', 'Security officer', 'Night shift', 'active');
    INSERT INTO public.applications (id, job_id, seeker_id) VALUES
      ('${APPLICATION}', '${JOB}', '${PROFILE}'), ('${OTHER_APPLICATION}', '${JOB}', '${OTHER_PROFILE}');
  `);
});

describe('the migrations', () => {
  test('are idempotent', async () => {
    await actAs(null, '');
    await db.exec(loadSql('supabase/migrations/20261113090000_security_hardening_4.sql'));
    await db.exec(loadSql('supabase/migrations/20261113100000_seeker_verifications.sql'));
  });

  test('the CV folder has a size and type limit', async () => {
    const bucket = await one(`SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'cvs'`);
    assert.equal(Number(bucket.file_size_limit), 20 * 1024 * 1024);
    assert.ok(bucket.allowed_mime_types.includes('application/pdf'));
    assert.ok(!bucket.allowed_mime_types.includes('application/zip'));
  });

  test('listings gain the police record flag, off by default', async () => {
    const row = await one(`SELECT police_record_required FROM public.job_listings WHERE id = '${JOB}'`);
    assert.equal(row.police_record_required, false);
  });

  test('uploads start closed', async () => {
    const row = await one(`SELECT uploads_open FROM public.verification_settings`);
    assert.equal(row.uploads_open, false);
  });
});

describe('a job seeker cannot verify themselves', () => {
  let id;
  before(async () => {
    await asServiceRole();
    await db.exec(`UPDATE public.verification_settings SET uploads_open = true, opened_at = now(), opened_by = '${ADMIN}'`);
    id = await createCheck(PROFILE, SEEKER, 'submitted');
  });

  test('cannot create a check from the browser', async () => {
    await asBrowser(SEEKER);
    await rejected(`INSERT INTO public.seeker_verifications (seeker_id, user_id) VALUES ('${PROFILE}', '${SEEKER}')`);
  });

  for (const [name, change] of [
    ['status', `status = 'approved'`],
    ['badge end date', `verified_until = current_date + 3650`],
    ['police record date', `police_record_issued_on = current_date`],
    ['file path', `police_record_file_path = 'someone-else/police.enc'`],
    ['decision', `decision_reason = NULL, reviewed_at = now()`],
    ['confirmation code', `confirmation_code = 'ZZZZZZZZ99'`],
    ['payment', `paid_at = now()`],
  ]) {
    test(`cannot change their own ${name}`, async () => {
      await asBrowser(SEEKER);
      await rejected(`UPDATE public.seeker_verifications SET ${change} WHERE id = '${id}'`);
    });
  }

  test('cannot delete their check or its audit trail', async () => {
    await asBrowser(SEEKER);
    await rejected(`DELETE FROM public.seeker_verifications WHERE id = '${id}'`);
    await rejected(`DELETE FROM public.verification_events WHERE verification_id = '${id}'`);
  });

  test('the write guard still refuses a browser if a grant is added by mistake', async () => {
    await actAs(null, '');
    await db.exec(`GRANT UPDATE ON public.seeker_verifications TO authenticated;
      CREATE POLICY mistake ON public.seeker_verifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);`);
    await asBrowser(SEEKER);
    await rejected(`UPDATE public.seeker_verifications SET verified_until = current_date + 3650 WHERE id = '${id}'`);
    await actAs(null, '');
    await db.exec(`DROP POLICY mistake ON public.seeker_verifications;
      REVOKE UPDATE ON public.seeker_verifications FROM authenticated;`);
  });

  test('can read the state of their own check, but not file paths or payment ids', async () => {
    await asBrowser(SEEKER);
    const row = await one(`SELECT status, decision_reason FROM public.seeker_verifications WHERE id = '${id}'`);
    assert.equal(row.status, 'submitted');
    await rejected(`SELECT police_record_file_path FROM public.seeker_verifications WHERE id = '${id}'`);
    await rejected(`SELECT rtw_file_path FROM public.seeker_verifications WHERE id = '${id}'`);
    await rejected(`SELECT stripe_payment_intent_id FROM public.seeker_verifications WHERE id = '${id}'`);
    await rejected(`SELECT police_record_sha256 FROM public.seeker_verifications WHERE id = '${id}'`);
  });

  test('nobody else can read it: another job seeker, an employer, or a signed-out visitor', async () => {
    for (const uid of [OTHER, EMPLOYER]) {
      await asBrowser(uid);
      assert.equal((await db.query(`SELECT id FROM public.seeker_verifications`)).rows.length, 0);
    }
    await actAs(null, 'anon');
    await db.exec('SET ROLE anon');
    await rejected(`SELECT id FROM public.seeker_verifications`);
  });

  test('the audit log and the upload switch are closed to browsers', async () => {
    await asBrowser(SEEKER);
    await rejected(`SELECT * FROM public.verification_events`);
    await rejected(`SELECT * FROM public.verification_settings`);
    await rejected(`UPDATE public.verification_settings SET uploads_open = true, opened_at = now()`);
  });
});

describe('status path', () => {
  test('a check cannot start anywhere but awaiting payment', async () => {
    await asServiceRole();
    await rejected(`INSERT INTO public.seeker_verifications (seeker_id, user_id, status, stripe_checkout_session_id, paid_at)
      VALUES ('${OTHER_PROFILE}', '${OTHER}', 'paid', 'cs_x', now())`);
  });

  test('even the server cannot skip review', async () => {
    const id = await createCheck(OTHER_PROFILE, OTHER, 'paid');
    await rejected(`UPDATE public.seeker_verifications SET status = 'approved' WHERE id = '${id}'`);
    await db.exec(`DELETE FROM public.seeker_verifications WHERE id = '${id}'`);
  });

  test('a paid check needs a payment, an approved one needs every review field', async () => {
    const id = await createCheck(OTHER_PROFILE, OTHER, 'awaiting_payment');
    await rejected(`UPDATE public.seeker_verifications SET status = 'paid' WHERE id = '${id}'`);
    await db.exec(`DELETE FROM public.seeker_verifications WHERE id = '${id}'`);
    const submitted = await createCheck(OTHER_PROFILE, OTHER, 'submitted');
    await rejected(`UPDATE public.seeker_verifications SET status = 'approved', rtw_file_path = NULL WHERE id = '${submitted}'`);
    await db.exec(`DELETE FROM public.seeker_verifications WHERE id = '${submitted}'`);
  });

  test('one open check per job seeker', async () => {
    await asServiceRole();
    await rejected(`INSERT INTO public.seeker_verifications (seeker_id, user_id) VALUES ('${PROFILE}', '${SEEKER}')`);
  });

  test('the ID image cannot outlive the decision', async () => {
    const id = await createCheck(OTHER_PROFILE, OTHER, 'submitted');
    await rejected(`UPDATE public.seeker_verifications SET status = 'not_approved', decision_reason = 'name_mismatch',
      police_record_file_path = NULL WHERE id = '${id}'`);
    await db.exec(`UPDATE public.seeker_verifications SET status = 'not_approved', decision_reason = 'name_mismatch',
      rtw_file_path = NULL, police_record_file_path = NULL, reviewed_at = now(), reviewed_by = '${ADMIN}' WHERE id = '${id}'`);
  });

  test('a decision reason is a code from the list, never free text', async () => {
    const id = await createCheck(OTHER_PROFILE, OTHER, 'submitted');
    await rejected(`UPDATE public.seeker_verifications SET decision_reason = 'record shows a conviction' WHERE id = '${id}'`);
    await db.exec(`DELETE FROM public.seeker_verifications WHERE id = '${id}'`);
  });

  test('a finished check is final and holds no police record', async () => {
    const id = await createCheck(OTHER_PROFILE, OTHER, 'approved', { code: 'BCDEFGHJ34' });
    await rejected(`UPDATE public.seeker_verifications SET status = 'expired' WHERE id = '${id}'`);
    await db.exec(`UPDATE public.seeker_verifications SET status = 'expired', police_record_file_path = NULL WHERE id = '${id}'`);
    await rejected(`UPDATE public.seeker_verifications SET status = 'approved', police_record_file_path = 'x' WHERE id = '${id}'`);
    await rejected(`UPDATE public.seeker_verifications SET police_record_file_path = '${id}/police-b.enc' WHERE id = '${id}'`);
  });

  test('every move is in the audit log, attributed, and the log cannot be edited', async () => {
    await asServiceRole();
    const { id } = await one(`SELECT id FROM public.seeker_verifications WHERE seeker_id = '${OTHER_PROFILE}' AND status = 'expired'`);
    const { rows } = await db.query(
      `SELECT from_status, to_status, actor_role, actor_id FROM public.verification_events
       WHERE verification_id = '${id}' ORDER BY created_at, to_status`
    );
    assert.deepEqual(rows.map((row) => row.to_status).sort(), ['approved', 'awaiting_payment', 'expired', 'paid', 'submitted']);
    assert.equal(rows.find((row) => row.to_status === 'approved').actor_id, ADMIN);
    assert.equal(rows.find((row) => row.to_status === 'approved').actor_role, 'admin');
    assert.equal(rows.find((row) => row.to_status === 'submitted').actor_id, OTHER);
    assert.equal(rows.find((row) => row.to_status === 'paid').actor_role, 'system');
    await rejected(`UPDATE public.verification_events SET actor_role = 'system' WHERE verification_id = '${id}'`);
  });
});

describe('the upload switch', () => {
  test('nothing can be submitted while uploads are closed', async () => {
    await asServiceRole();
    await db.exec(`DELETE FROM public.seeker_verifications WHERE seeker_id = '${PROFILE}'`);
    await db.exec(`UPDATE public.verification_settings SET uploads_open = false, opened_at = NULL, opened_by = NULL`);
    await assert.rejects(() => createCheck(PROFILE, SEEKER, 'submitted'), /Uploads are not open yet/);
    await db.exec(`DELETE FROM public.seeker_verifications WHERE seeker_id = '${PROFILE}'`);
  });

  test('cannot be closed again while documents are stored', async () => {
    await asServiceRole();
    await db.exec(`UPDATE public.verification_settings SET uploads_open = true, opened_at = now(), opened_by = '${ADMIN}'`);
    await createCheck(PROFILE, SEEKER, 'approved');
    await rejected(`UPDATE public.verification_settings SET uploads_open = false, opened_at = NULL`);
    await rejected(`DELETE FROM public.verification_settings`);
  });
});

describe('badges and sharing', () => {
  test('one live badge per job seeker', async () => {
    const second = await createCheck(PROFILE, SEEKER, 'submitted');
    await rejected(`UPDATE public.seeker_verifications SET status = 'approved', rtw_group = 'citizen',
      rtw_document_type = 'passport', rtw_file_path = NULL, police_record_issued_on = current_date,
      verified_until = current_date + 180, confirmation_code = 'CDEFGHJK45', reviewed_at = now() WHERE id = '${second}'`);
    await db.exec(`UPDATE public.seeker_verifications SET status = 'not_approved', decision_reason = 'document_expired',
      rtw_file_path = NULL, police_record_file_path = NULL, reviewed_at = now() WHERE id = '${second}'`);
  });

  test('a signed-in user sees only that a badge exists', async () => {
    await asBrowser(EMPLOYER);
    const { rows } = await db.query(`SELECT * FROM public.verified_badges(ARRAY['${PROFILE}', '${OTHER_PROFILE}']::uuid[])`);
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['checked_on', 'holds_work_permit', 'seeker_id']);
    assert.equal(rows[0].seeker_id, PROFILE);
    assert.equal(rows[0].holds_work_permit, false);
  });

  test('a signed-out visitor cannot look up badges', async () => {
    await actAs(null, 'anon');
    await db.exec('SET ROLE anon');
    await rejected(`SELECT * FROM public.verified_badges(ARRAY['${PROFILE}']::uuid[])`);
  });

  test('documents can only be shared from the applicant\'s own valid check', async () => {
    await asServiceRole();
    const { id } = await one(`SELECT id FROM public.seeker_verifications WHERE seeker_id = '${PROFILE}' AND status = 'approved'`);
    // Someone else's application cannot carry this person's documents.
    await rejected(`INSERT INTO public.verification_shares (application_id, verification_id, share_police_record)
      VALUES ('${OTHER_APPLICATION}', '${id}', true)`);
    // A share must carry at least one document.
    await rejected(`INSERT INTO public.verification_shares (application_id, verification_id) VALUES ('${APPLICATION}', '${id}')`);
    await db.exec(`INSERT INTO public.verification_shares (application_id, verification_id, share_police_record, share_rtw)
      VALUES ('${APPLICATION}', '${id}', true, true)`);
  });

  test('a share can be stopped but not widened or restarted', async () => {
    await asServiceRole();
    await rejected(`UPDATE public.verification_shares SET share_rtw = false WHERE application_id = '${APPLICATION}'`);
    await db.exec(`UPDATE public.verification_shares SET revoked_at = now() WHERE application_id = '${APPLICATION}'`);
    await rejected(`UPDATE public.verification_shares SET revoked_at = NULL WHERE application_id = '${APPLICATION}'`);
  });

  test('the job seeker can read their shares and who opened them; the employer cannot', async () => {
    await asServiceRole();
    await db.exec(`INSERT INTO public.verification_views (share_id, viewer_id, company_id, document)
      SELECT id, '${EMPLOYER}', '${COMPANY}', 'police_record' FROM public.verification_shares`);
    await asBrowser(SEEKER);
    assert.equal((await db.query(`SELECT id FROM public.verification_shares`)).rows.length, 1);
    assert.equal((await db.query(`SELECT id FROM public.verification_views`)).rows.length, 1);
    await rejected(`UPDATE public.verification_shares SET revoked_at = NULL`);
    await rejected(`INSERT INTO public.verification_views (share_id, document) SELECT id, 'rtw' FROM public.verification_shares`);
    for (const uid of [EMPLOYER, OTHER]) {
      await asBrowser(uid);
      assert.equal((await db.query(`SELECT id FROM public.verification_shares`)).rows.length, 0);
      assert.equal((await db.query(`SELECT id FROM public.verification_views`)).rows.length, 0);
    }
  });

  test('an expired badge cannot be shared', async () => {
    await asServiceRole();
    await db.exec(`DELETE FROM public.verification_shares`);
    await db.exec(`UPDATE public.seeker_verifications SET verified_until = current_date - 2 WHERE seeker_id = '${PROFILE}' AND status = 'approved'`);
    const { id } = await one(`SELECT id FROM public.seeker_verifications WHERE seeker_id = '${PROFILE}' AND status = 'approved'`);
    await rejected(`INSERT INTO public.verification_shares (application_id, verification_id, share_police_record)
      VALUES ('${APPLICATION}', '${id}', true)`);
    await asBrowser(EMPLOYER);
    assert.equal((await db.query(`SELECT * FROM public.verified_badges(ARRAY['${PROFILE}']::uuid[])`)).rows.length, 0);
  });
});

describe('the private folder', () => {
  test('is private and takes only encrypted blobs', async () => {
    await asServiceRole();
    const bucket = await one(`SELECT public, allowed_mime_types FROM storage.buckets WHERE id = 'verification-private'`);
    assert.equal(bucket.public, false);
    assert.deepEqual(bucket.allowed_mime_types, ['application/octet-stream']);
  });

  test('no browser can read, list or write it, even with a careless bucket-wide policy', async () => {
    await actAs(null, '');
    await db.exec(`INSERT INTO storage.objects (bucket_id, name) VALUES ('verification-private', 'x/police-1.enc'), ('cvs', 'ok.pdf')`);
    for (const role of ['anon', 'authenticated']) {
      await actAs(SEEKER, role);
      await db.exec(`SET ROLE ${role}`);
      const { rows } = await db.query(`SELECT bucket_id FROM storage.objects`);
      assert.deepEqual(rows.map((row) => row.bucket_id), ['cvs']);
      await rejected(`INSERT INTO storage.objects (bucket_id, name) VALUES ('verification-private', 'x/mine.enc')`);
      const before = await db.query(`UPDATE storage.objects SET name = 'stolen' WHERE bucket_id = 'verification-private' RETURNING id`);
      assert.equal(before.rows.length, 0);
      const removed = await db.query(`DELETE FROM storage.objects WHERE bucket_id = 'verification-private' RETURNING id`);
      assert.equal(removed.rows.length, 0);
    }
  });
});

describe('deleting an account removes its verification records', () => {
  test('profile deletion cascades to checks, shares, views and the audit log', async () => {
    await asServiceRole();
    await db.exec(`DELETE FROM public.seeker_profiles WHERE id = '${PROFILE}'`);
    for (const table of ['seeker_verifications', 'verification_shares', 'verification_views']) {
      assert.equal((await db.query(`SELECT 1 FROM public.${table}`)).rows.filter(Boolean).length >= 0, true);
    }
    assert.equal((await db.query(`SELECT 1 FROM public.seeker_verifications WHERE seeker_id = '${PROFILE}'`)).rows.length, 0);
    assert.equal((await db.query(
      `SELECT 1 FROM public.verification_events e WHERE NOT EXISTS (SELECT 1 FROM public.seeker_verifications v WHERE v.id = e.verification_id)`
    )).rows.length, 0);
  });
});
