/**
 * Regression tests for the database-level security guarantees.
 *
 * These invariants cannot be enforced in application code, because companies
 * and job_listings are written directly from the browser with the anon key.
 * The database is the only thing standing between an employer and a free Pro
 * subscription, so the rules get a test.
 *
 * Runs schema-clean.sql plus the hardening migrations into an in-memory
 * Postgres (pglite). auth.uid() and auth.role() are stubbed so we can act as
 * an employer or as the service role; everything else is real Postgres.
 */
import test, { before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const EMPLOYER = '11111111-1111-1111-1111-111111111111';
const SEEKER = '22222222-2222-2222-2222-222222222222';
const COMPANY = '33333333-3333-3333-3333-333333333333';

let db;

/** Run as a given user, or as the service role when uid is null. */
async function actAs(uid, role = 'authenticated') {
  await db.exec(
    `UPDATE _ctx SET uid = ${uid ? `'${uid}'` : 'NULL'}, role = '${role}'`
  );
}

const asServiceRole = () => actAs(null, 'service_role');

/** Assert a statement is refused by a trigger or CHECK constraint. */
async function assertRejected(sql, message) {
  await assert.rejects(() => db.exec(sql), message);
}

function loadSql(path) {
  // pglite ships pgcrypto but not uuid-ossp; gen_random_uuid() is equivalent here.
  return readFileSync(path, 'utf8')
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
    .replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');
}

before(async () => {
  db = new PGlite();

  // Minimal Supabase surface: the auth/storage schemas and the two helpers
  // every policy and trigger calls.
  await db.exec(`
    -- Roles Supabase provides out of the box; the migration GRANTs against them.
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB);
    CREATE TABLE _ctx (uid UUID, role TEXT);
    INSERT INTO _ctx VALUES (NULL, 'authenticated');
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE
      AS $$ SELECT uid FROM _ctx LIMIT 1 $$;
    CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE
      AS $$ SELECT role FROM _ctx LIMIT 1 $$;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN);
    CREATE TABLE storage.objects (
      id UUID DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT, owner UUID
    );
    CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE
      AS $$ SELECT string_to_array(name, '/') $$;
  `);

  await db.exec(loadSql('schema-clean.sql'));

  // Columns added by later migrations that the hardening migration builds on.
  await db.exec(`
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS posted_by_admin boolean DEFAULT false;
  `);

  await db.exec(loadSql('supabase/migrations/20260601_security_hardening.sql'));
  await db.exec(loadSql('supabase/migrations/20260925_security_hardening_2.sql'));

  // public.users rows come from the on_auth_user_created trigger, same as
  // production -- inserting them by hand would collide with it.
  await asServiceRole();
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${EMPLOYER}', 'employer@example.com', '{"role":"employer"}'),
      ('${SEEKER}', 'seeker@example.com', '{"role":"seeker"}');
    UPDATE public.users SET email_verified = true
      WHERE id IN ('${EMPLOYER}', '${SEEKER}');
    INSERT INTO public.companies (id, user_id, company_name)
      VALUES ('${COMPANY}', '${EMPLOYER}', 'Acme Ltd');
  `);
});

describe('the migration itself', () => {
  test('is idempotent', async () => {
    await db.exec(loadSql('supabase/migrations/20260925_security_hardening_2.sql'));
  });
});

describe('companies: privileged fields are server-managed', () => {
  test('an employer cannot grant themselves Pro', async () => {
    await actAs(EMPLOYER);
    await assertRejected(
      `UPDATE public.companies SET is_pro = true WHERE id = '${COMPANY}'`
    );
  });

  test('an employer cannot grant themselves a verified badge', async () => {
    await actAs(EMPLOYER);
    await assertRejected(
      `UPDATE public.companies SET is_verified = true WHERE id = '${COMPANY}'`
    );
  });

  test('an employer cannot extend their own Pro expiry', async () => {
    await actAs(EMPLOYER);
    await assertRejected(
      `UPDATE public.companies SET pro_expires_at = NOW() + interval '10 years'
       WHERE id = '${COMPANY}'`
    );
  });

  test('an employer cannot attach an arbitrary Stripe customer', async () => {
    await actAs(EMPLOYER);
    await assertRejected(
      `UPDATE public.companies SET stripe_customer_id = 'cus_someoneelse'
       WHERE id = '${COMPANY}'`
    );
  });

  test('an employer can still edit their own profile copy', async () => {
    await actAs(EMPLOYER);
    await db.exec(
      `UPDATE public.companies SET description = 'We do things' WHERE id = '${COMPANY}'`
    );
  });

  test('the Stripe webhook can still set Pro', async () => {
    await asServiceRole();
    await db.exec(`UPDATE public.companies SET is_pro = true WHERE id = '${COMPANY}'`);
    await db.exec(`UPDATE public.companies SET is_pro = false WHERE id = '${COMPANY}'`);
  });
});

describe('companies: input constraints', () => {
  test('a javascript: website is refused', async () => {
    await actAs(EMPLOYER);
    await assertRejected(
      `UPDATE public.companies SET website = 'javascript:alert(1)' WHERE id = '${COMPANY}'`
    );
  });

  test('an https website is accepted', async () => {
    await actAs(EMPLOYER);
    await db.exec(
      `UPDATE public.companies SET website = 'https://acme.example' WHERE id = '${COMPANY}'`
    );
  });

  test('an unbounded description is refused', async () => {
    await actAs(EMPLOYER);
    await assertRejected(
      `UPDATE public.companies SET description = repeat('x', 6000) WHERE id = '${COMPANY}'`
    );
  });
});

describe('job_listings: moderation cannot be skipped', () => {
  const JOB = '44444444-4444-4444-4444-444444444444';

  test('an insert is forced to pending_approval and unfeatured', async () => {
    await actAs(EMPLOYER);
    await db.exec(
      `INSERT INTO public.job_listings (id, company_id, title, description, status, is_featured)
       VALUES ('${JOB}', '${COMPANY}', 'Chef', 'Cook things', 'active', true)`
    );
    const { rows } = await db.query(
      `SELECT status::text AS status, is_featured FROM public.job_listings WHERE id = '${JOB}'`
    );
    assert.equal(rows[0].status, 'pending_approval');
    assert.equal(rows[0].is_featured, false);
  });

  test('an employer cannot approve their own listing', async () => {
    await actAs(EMPLOYER);
    await assertRejected(
      `UPDATE public.job_listings SET status = 'active' WHERE id = '${JOB}'`
    );
  });

  test('an employer cannot feature their own listing', async () => {
    await actAs(EMPLOYER);
    await assertRejected(
      `UPDATE public.job_listings SET is_featured = true WHERE id = '${JOB}'`
    );
  });

  test('an employer can close their own listing', async () => {
    await actAs(EMPLOYER);
    await db.exec(`UPDATE public.job_listings SET status = 'closed' WHERE id = '${JOB}'`);
  });

  test('a non-material edit leaves an approved listing live', async () => {
    await asServiceRole();
    await db.exec(`UPDATE public.job_listings SET status = 'active' WHERE id = '${JOB}'`);
    await actAs(EMPLOYER);
    await db.exec(
      `UPDATE public.job_listings SET salary_min = 1000, salary_max = 2000 WHERE id = '${JOB}'`
    );
    const { rows } = await db.query(
      `SELECT status::text AS status FROM public.job_listings WHERE id = '${JOB}'`
    );
    assert.equal(rows[0].status, 'active');
  });

  test('rewriting an approved listing sends it back for review', async () => {
    await actAs(EMPLOYER);
    await db.exec(
      `UPDATE public.job_listings SET description = 'Totally different job' WHERE id = '${JOB}'`
    );
    const { rows } = await db.query(
      `SELECT status::text AS status FROM public.job_listings WHERE id = '${JOB}'`
    );
    assert.equal(rows[0].status, 'pending_approval');
  });

  test('a listing cannot be moved to another company', async () => {
    await asServiceRole();
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('55555555-5555-5555-5555-555555555555', 'other@example.com', '{"role":"employer"}');
      INSERT INTO public.companies (id, user_id, company_name)
        VALUES ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'Other Co');
    `);
    await actAs(EMPLOYER);
    await assertRejected(
      `UPDATE public.job_listings SET company_id = '66666666-6666-6666-6666-666666666666'
       WHERE id = '${JOB}'`
    );
  });
});

describe('job_listings: free tier cap', () => {
  test('a free account is capped at one open listing', async () => {
    await actAs(EMPLOYER);
    await assertRejected(
      `INSERT INTO public.job_listings (company_id, title, description)
       VALUES ('${COMPANY}', 'Second job', 'Another one')`
    );
  });

  test('a Pro account is not capped', async () => {
    await asServiceRole();
    await db.exec(`UPDATE public.companies SET is_pro = true WHERE id = '${COMPANY}'`);
    await actAs(EMPLOYER);
    await db.exec(
      `INSERT INTO public.job_listings (company_id, title, description)
       VALUES ('${COMPANY}', 'Second job', 'Another one')`
    );
    await asServiceRole();
    await db.exec(`UPDATE public.companies SET is_pro = false WHERE id = '${COMPANY}'`);
  });
});

describe('rate limiting', () => {
  test('allows exactly the configured number of calls', async () => {
    await asServiceRole();
    let allowed = 0;
    for (let i = 0; i < 5; i++) {
      const { rows } = await db.query(
        `SELECT * FROM public.consume_rate_limit('test:allow', 3, 60)`
      );
      if (rows[0].allowed) allowed++;
    }
    assert.equal(allowed, 3);
  });

  test('reports a usable retry_after once exhausted', async () => {
    await asServiceRole();
    const { rows } = await db.query(
      `SELECT * FROM public.consume_rate_limit('test:allow', 3, 60)`
    );
    assert.equal(rows[0].allowed, false);
    assert.equal(rows[0].remaining, 0);
    assert.ok(rows[0].retry_after_seconds > 0 && rows[0].retry_after_seconds <= 60);
  });

  test('buckets are independent', async () => {
    await asServiceRole();
    const { rows } = await db.query(
      `SELECT * FROM public.consume_rate_limit('test:other', 3, 60)`
    );
    assert.equal(rows[0].allowed, true);
  });

  test('an expired window resets the counter', async () => {
    await asServiceRole();
    await db.exec(
      `UPDATE public.rate_limits SET window_started_at = NOW() - interval '2 minutes'
       WHERE bucket = 'test:allow'`
    );
    const { rows } = await db.query(
      `SELECT * FROM public.consume_rate_limit('test:allow', 3, 60)`
    );
    assert.equal(rows[0].allowed, true);
  });
});

describe('stripe webhook idempotency', () => {
  test('the same event id cannot be recorded twice', async () => {
    await asServiceRole();
    await db.exec(
      `INSERT INTO public.stripe_webhook_events (id, type) VALUES ('evt_1', 'checkout.session.completed')`
    );
    await assertRejected(
      `INSERT INTO public.stripe_webhook_events (id, type) VALUES ('evt_1', 'checkout.session.completed')`
    );
  });
});
