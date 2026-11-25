/**
 * Database guarantees for employer pricing (Job Spotlight and Employer Pro).
 *
 * Every Stripe event, checkout, invoice and billing period counts once; a
 * credit funds one campaign; a vacancy never has overlapping paid windows; and
 * the candidate directory is open to everyone until the gate is switched on,
 * then Pro only. Runs against Postgres (pglite), like the other DB tests.
 */
import test, { before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER_OWNER = '22222222-2222-2222-2222-222222222222';
const SEEKER = '33333333-3333-3333-3333-333333333333';
const ADMIN = '44444444-4444-4444-4444-444444444444';
const FREE_OWNER = '55555555-5555-5555-5555-555555555555';
const FREE_COMPANY = 'aaaaaaaa-0000-0000-0000-000000000005';
const FREE_JOB = 'cccccccc-0000-0000-0000-000000000005';
const COMPANY = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_COMPANY = 'aaaaaaaa-0000-0000-0000-000000000002';
const PROFILE = 'bbbbbbbb-0000-0000-0000-000000000001';
const JOB = 'cccccccc-0000-0000-0000-000000000001';
const JOB_2 = 'cccccccc-0000-0000-0000-000000000002';
const OTHER_JOB = 'cccccccc-0000-0000-0000-000000000003';
const CLOSED_JOB = 'cccccccc-0000-0000-0000-000000000004';

let db;
async function actAs(uid, role = 'authenticated') {
  await db.exec(`RESET ROLE; UPDATE _ctx SET uid = ${uid ? `'${uid}'` : 'NULL'}, role = '${role}'`);
}
const asServer = () => actAs(null, 'service_role');
async function asBrowser(uid) { await actAs(uid); await db.exec('SET ROLE authenticated'); }
const one = async (sql) => (await db.query(sql)).rows[0];
const rejected = (sql, message) => assert.rejects(() => db.exec(sql), message);
const q = (value) => (value === null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);
function loadSql(path) {
  return readFileSync(path, 'utf8')
    .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
    .replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');
}

const spotlight = (event, session, reference, { amount = 12500, pi = `pi_${session}`, live = true } = {}) =>
  one(`SELECT public.record_spotlight_payment(${q(event)}, 'checkout.session.completed', ${q(session)}, ${q(reference)},
    ${q(pi)}, 'cus_1', 'boss@example.com', ${amount}, 'xcd', ${live}) AS r`).then((row) => row.r);
const proCheckout = (event, session, reference, subscription, live = true) =>
  one(`SELECT public.record_pro_checkout(${q(event)}, 'checkout.session.completed', ${q(session)}, ${q(reference)},
    ${q(subscription)}, 'cus_1', 'boss@example.com', ${live}) AS r`).then((row) => row.r);
const invoice = (event, invoiceId, subscription, start, end, { amount = 20000, pi = `pi_${invoiceId}` } = {}) =>
  one(`SELECT public.record_pro_invoice(${q(event)}, 'invoice.paid', ${q(invoiceId)}, ${q(subscription)}, ${q(pi)}, 'cus_1',
    ${q(start)}, ${q(end)}, ${amount}, 'xcd', true) AS r`).then((row) => row.r);
const startOrder = (offer, company = COMPANY) =>
  one(`INSERT INTO public.employer_orders (offer, company_id, purchaser_id, livemode) VALUES ('${offer}', '${company}', '${OWNER}', true)
    RETURNING id, reference`);
const hasPro = (company = COMPANY) => one(`SELECT public.employer_has_pro('${company}') AS v`).then((row) => row.v);
const credits = (company = COMPANY) => db.query(`SELECT * FROM public.spotlight_credits WHERE company_id = '${company}' ORDER BY created_at`).then((r) => r.rows);
const iso = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

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
    CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects (id UUID DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT, owner UUID);
    CREATE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
  `);
  await db.exec(loadSql('schema-clean.sql'));
  await db.exec(`
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS posted_by_admin boolean DEFAULT false;
  `);
  // The users-table policy fixes production has, so row security can be exercised.
  await db.exec(loadSql('supabase/migrations/20260312_add_is_admin_column.sql'));
  await db.exec(loadSql('supabase/migrations/20260312_fix_admin_rls_final.sql'));
  await db.exec(loadSql('supabase/migrations/20260601_security_hardening.sql'));
  await db.exec(loadSql('supabase/migrations/20260925_security_hardening_2.sql'));
  await db.exec(loadSql('supabase/migrations/20261125090000_employer_billing.sql'));
  await db.exec(`
    GRANT USAGE ON SCHEMA public, storage TO anon, authenticated;
    GRANT SELECT ON public.seeker_profiles, public.users, public.companies, public.applications, public.job_listings TO authenticated;
    -- What production has on top of the repo schema: employers can read their own applicants.
    CREATE OR REPLACE FUNCTION public.is_employer_of_applicant(p_seeker_id uuid, p_employer_uid uuid) RETURNS boolean
      LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM applications a JOIN job_listings j ON a.job_id = j.id JOIN companies c ON j.company_id = c.id
        WHERE a.seeker_id = p_seeker_id AND c.user_id = p_employer_uid) $$;
    DROP POLICY IF EXISTS "Employers can view applicant profiles" ON public.seeker_profiles;
    CREATE POLICY "Employers can view applicant profiles" ON public.seeker_profiles FOR SELECT USING (public.is_employer_of_applicant(id, auth.uid()));
  `);

  await asServer();
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${OWNER}', 'boss@example.com', '{"role":"employer"}'),
      ('${OTHER_OWNER}', 'other@example.com', '{"role":"employer"}'),
      ('${SEEKER}', 'sam@example.com', '{"role":"seeker"}'),
      ('${ADMIN}', 'admin@example.com', '{"role":"seeker"}'),
      ('${FREE_OWNER}', 'free@example.com', '{"role":"employer"}');
    UPDATE public.users SET email_verified = true;
    UPDATE public.users SET is_admin = true WHERE id = '${ADMIN}';
    INSERT INTO public.companies (id, user_id, company_name) VALUES ('${COMPANY}', '${OWNER}', 'Treehouse'), ('${OTHER_COMPANY}', '${OTHER_OWNER}', 'Other Co'), ('${FREE_COMPANY}', '${FREE_OWNER}', 'Free Co');
    INSERT INTO public.seeker_profiles (id, user_id, first_name, last_name, visibility) VALUES ('${PROFILE}', '${SEEKER}', 'Sam', 'Seeker', 'actively_looking');
    INSERT INTO public.job_listings (id, company_id, title, description, status) VALUES
      ('${JOB}', '${COMPANY}', 'Line Cook', 'Kitchen', 'active'),
      ('${JOB_2}', '${COMPANY}', 'Head Chef', 'Kitchen', 'active'),
      ('${OTHER_JOB}', '${OTHER_COMPANY}', 'Steward', 'Other', 'active'),
      ('${CLOSED_JOB}', '${COMPANY}', 'Old job', 'Closed', 'closed'),
      ('${FREE_JOB}', '${FREE_COMPANY}', 'Waiter', 'Free', 'active');
  `);
});

describe('the migration', () => {
  test('is idempotent', async () => {
    await actAs(null, '');
    await db.exec(loadSql('supabase/migrations/20261125090000_employer_billing.sql'));
  });
  test('starts with the directory open and no featured jobs', async () => {
    await asServer();
    assert.equal((await one('SELECT directory_gated FROM public.employer_billing_settings')).directory_gated, false);
    assert.equal((await one('SELECT count(*)::int n FROM public.job_listings WHERE spotlight_until IS NOT NULL')).n, 0);
  });
});

describe('browsers cannot buy themselves anything', () => {
  test('cannot create orders, credits, periods or campaigns, or read billing tables', async () => {
    await asBrowser(OWNER);
    for (const sql of [
      `INSERT INTO public.employer_orders (offer, company_id, livemode) VALUES ('pro', '${COMPANY}', true)`,
      `INSERT INTO public.spotlight_credits (company_id, source, granted_by) VALUES ('${COMPANY}', 'manual', '${OWNER}')`,
      `INSERT INTO public.employer_pro_periods (stripe_subscription_id, stripe_invoice_id, company_id, period_start, period_end, amount)
         VALUES ('sub_x', 'in_x', '${COMPANY}', now(), now() + interval '1 year', 20000)`,
      `SELECT * FROM public.employer_orders`,
      `SELECT * FROM public.spotlight_credits`,
      `UPDATE public.employer_billing_settings SET directory_gated = false`,
    ]) await rejected(sql);
  });

  test('cannot feature their own listing or call the billing functions', async () => {
    await asBrowser(OWNER);
    await rejected(`UPDATE public.job_listings SET spotlight_until = now() + interval '30 days' WHERE id = '${JOB}'`);
    await rejected(`SELECT public.redeem_spotlight_credit(gen_random_uuid(), '${COMPANY}', '${JOB}', current_date, '${OWNER}')`);
    await rejected(`SELECT public.employer_has_pro('${COMPANY}')`);
    await rejected(`SELECT public.start_spotlight_campaign(gen_random_uuid())`);
  });
});

describe('Spotlight payments', () => {
  test('a paid order from the start page becomes one credit for that company', async () => {
    await asServer();
    const order = await startOrder('spotlight');
    const result = await spotlight('evt_s1', 'cs_s1', order.reference);
    assert.equal(result.outcome, 'applied');
    assert.equal(result.companyId, COMPANY);
    assert.equal((await credits()).length, 1);
    assert.equal((await credits())[0].expires_at, null);
  });

  test('the same event twice, or a second event for the same session, still gives one credit', async () => {
    await asServer();
    assert.equal((await spotlight('evt_s1', 'cs_s1', null)).outcome, 'duplicate');
    assert.equal((await spotlight('evt_s1_async', 'cs_s1', null)).outcome, 'applied');
    assert.equal((await credits()).length, 1);
    assert.equal((await one(`SELECT count(*)::int n FROM public.employer_orders WHERE stripe_checkout_session_id = 'cs_s1'`)).n, 1);
  });

  test('a wrong amount is refused and changes nothing', async () => {
    await asServer();
    await assert.rejects(() => spotlight('evt_bad', 'cs_bad', null, { amount: 100 }), /spotlight_amount_mismatch/);
    assert.equal((await one(`SELECT count(*)::int n FROM public.employer_billing_events WHERE event_id = 'evt_bad'`)).n, 0);
  });

  test('a test-mode payment cannot complete a live order', async () => {
    await asServer();
    const order = await startOrder('spotlight');
    await assert.rejects(() => spotlight('evt_mode', 'cs_mode', order.reference, { live: false }), /livemode_mismatch/);
  });

  test('a shared raw link stays unassigned until staff assign it', async () => {
    await asServer();
    const result = await spotlight('evt_raw', 'cs_raw', null);
    assert.equal(result.outcome, 'unassigned');
    const order = await one(`SELECT * FROM public.employer_orders WHERE id = '${result.orderId}'`);
    assert.equal(order.company_id, null);
    assert.equal(order.needs_review, true);
    assert.equal((await one(`SELECT company_id FROM public.spotlight_credits WHERE order_id = '${result.orderId}'`)).company_id, null);
    // A guessed or typed reference that matches nothing is treated the same way.
    assert.equal((await spotlight('evt_guess', 'cs_guess', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).outcome, 'unassigned');

    await one(`SELECT public.assign_employer_order('${result.orderId}', '${OTHER_COMPANY}', '${ADMIN}')`);
    assert.equal((await credits(OTHER_COMPANY)).length, 1);
    await assert.rejects(() => one(`SELECT public.assign_employer_order('${result.orderId}', '${COMPANY}', '${ADMIN}')`), /order_already_assigned/);
  });
});

describe('Pro billing', () => {
  const start = iso(-1), end = iso(29);

  test('an invoice that arrives before the checkout is held, then assigned', async () => {
    await asServer();
    const order = await startOrder('pro');
    const early = await invoice('evt_i1', 'in_1', 'sub_1', start, end);
    assert.equal(early.outcome, 'unassigned');
    assert.equal(await hasPro(), false);
    const bound = await proCheckout('evt_c1', 'cs_p1', order.reference, 'sub_1');
    assert.equal(bound.outcome, 'applied');
    assert.equal(await hasPro(), true);
    const monthly = (await credits()).filter((c) => c.source === 'pro_period');
    assert.equal(monthly.length, 1);
    assert.equal(new Date(monthly[0].expires_at).toISOString(), new Date(end).toISOString());
  });

  test('replays and a corrected invoice for the same month give one period and one credit', async () => {
    await asServer();
    assert.equal((await invoice('evt_i1', 'in_1', 'sub_1', start, end)).outcome, 'duplicate');
    assert.equal((await invoice('evt_i1b', 'in_1', 'sub_1', start, end)).outcome, 'period_exists');
    assert.equal((await invoice('evt_i1c', 'in_1_corrected', 'sub_1', start, end)).outcome, 'period_exists');
    assert.equal((await proCheckout('evt_c1', 'cs_p1', null, 'sub_1')).outcome, 'duplicate');
    assert.equal((await one(`SELECT count(*)::int n FROM public.employer_pro_periods WHERE stripe_subscription_id = 'sub_1'`)).n, 1);
    assert.equal((await credits()).filter((c) => c.source === 'pro_period').length, 1);
  });

  test('renewal adds a month and a credit; a failed renewal adds nothing and access lapses', async () => {
    await asServer();
    const renewalStart = iso(-60), renewalEnd = iso(-30);
    await invoice('evt_old', 'in_old', 'sub_old', renewalStart, renewalEnd);
    const order = await startOrder('pro', OTHER_COMPANY);
    await proCheckout('evt_c_old', 'cs_old', order.reference, 'sub_old');
    // Its only paid month ended 30 days ago and no renewal settled.
    assert.equal(await hasPro(OTHER_COMPANY), false);
    await invoice('evt_recover', 'in_recover', 'sub_old', iso(-1), iso(29));
    assert.equal(await hasPro(OTHER_COMPANY), true);
  });

  test('a second subscription for a company that already has Pro is flagged', async () => {
    await asServer();
    const order = await startOrder('pro');
    const result = await proCheckout('evt_c_dup', 'cs_dup', order.reference, 'sub_dup');
    assert.equal(result.duplicateSubscription, true);
    assert.equal((await one(`SELECT review_reason FROM public.employer_orders WHERE id = '${order.id}'`)).review_reason, 'duplicate_subscription');
  });

  test('a wrong Pro amount is refused', async () => {
    await asServer();
    await assert.rejects(() => invoice('evt_cheap', 'in_cheap', 'sub_1', iso(30), iso(60), { amount: 100 }), /pro_amount_mismatch/);
  });

  test('a manual or complimentary grant still counts as Pro, until its expiry', async () => {
    await asServer();
    const plain = 'aaaaaaaa-0000-0000-0000-000000000009';
    await db.exec(`INSERT INTO public.companies (id, user_id, company_name, is_pro) VALUES ('${plain}', '${ADMIN}', 'Grant Co', true)`);
    assert.equal(await hasPro(plain), true);
    await db.exec(`UPDATE public.companies SET pro_expires_at = now() - interval '1 day' WHERE id = '${plain}'`);
    assert.equal(await hasPro(plain), false);
  });
});

describe('redeeming credits', () => {
  let creditId;
  before(async () => {
    await asServer();
    creditId = (await credits()).find((c) => c.source === 'purchase' && c.status === 'available').id;
  });

  test('only on an active vacancy the company owns', async () => {
    await asServer();
    for (const job of [OTHER_JOB, CLOSED_JOB]) {
      await assert.rejects(() => one(`SELECT public.redeem_spotlight_credit('${creditId}', '${COMPANY}', '${job}', current_date, '${OWNER}')`), /job_not_eligible/);
    }
    await assert.rejects(() => one(`SELECT public.redeem_spotlight_credit('${creditId}', '${OTHER_COMPANY}', '${OTHER_JOB}', current_date, '${OTHER_OWNER}')`), /credit_not_found/);
  });

  test('once: a second spend of the same credit is refused', async () => {
    await asServer();
    const campaign = await one(`SELECT public.redeem_spotlight_credit('${creditId}', '${COMPANY}', '${JOB}', current_date, '${OWNER}') AS r`);
    assert.ok(campaign.r.campaignId);
    await assert.rejects(() => one(`SELECT public.redeem_spotlight_credit('${creditId}', '${COMPANY}', '${JOB_2}', current_date, '${OWNER}')`), /credit_unavailable/);
  });

  test('two credits racing for the same vacancy: the second booking is refused', async () => {
    await asServer();
    const monthly = (await credits()).find((c) => c.source === 'pro_period' && c.status === 'available');
    await assert.rejects(() => one(`SELECT public.redeem_spotlight_credit('${monthly.id}', '${COMPANY}', '${JOB}', current_date, '${OWNER}')`), /already has a Spotlight/);
    assert.equal((await one(`SELECT status FROM public.spotlight_credits WHERE id = '${monthly.id}'`)).status, 'available');
  });

  test('an expired credit cannot be spent', async () => {
    await asServer();
    const { id } = await one(`INSERT INTO public.spotlight_credits (company_id, source, granted_by, expires_at)
      VALUES ('${COMPANY}', 'manual', '${ADMIN}', now() - interval '1 minute') RETURNING id`);
    await assert.rejects(() => one(`SELECT public.redeem_spotlight_credit('${id}', '${COMPANY}', '${JOB_2}', current_date, '${OWNER}')`), /credit_expired/);
  });
});

describe('the campaign window', () => {
  let campaignId;
  before(async () => {
    await asServer();
    campaignId = (await one(`SELECT id FROM public.spotlight_campaigns WHERE job_id = '${JOB}'`)).id;
  });

  test('going live features the vacancy for exactly 168 hours', async () => {
    await asServer();
    await one(`SELECT public.start_spotlight_campaign('${campaignId}')`);
    const row = await one(`SELECT c.starts_at, c.ends_at, j.spotlight_until FROM public.spotlight_campaigns c JOIN public.job_listings j ON j.id = c.job_id WHERE c.id = '${campaignId}'`);
    assert.equal(new Date(row.ends_at) - new Date(row.starts_at), 168 * 3_600_000);
    assert.equal(new Date(row.spotlight_until).toISOString(), new Date(row.ends_at).toISOString());
    assert.equal((await one(`SELECT is_featured FROM public.job_listings WHERE id = '${JOB}'`)).is_featured, true);
    await assert.rejects(() => one(`SELECT public.start_spotlight_campaign('${campaignId}')`), /campaign_not_startable/);
  });

  test('windows on the same vacancy cannot overlap', async () => {
    await asServer();
    const { id } = await one(`INSERT INTO public.spotlight_credits (company_id, source, granted_by) VALUES ('${COMPANY}', 'manual', '${ADMIN}') RETURNING id`);
    await rejected(`INSERT INTO public.spotlight_campaigns (credit_id, company_id, job_id, requested_start, status, starts_at, ends_at)
      VALUES ('${id}', '${COMPANY}', '${JOB}', current_date, 'ended', now(), now() + interval '2 days')`, /cannot overlap/);
  });

  test('an early closure ends it and the listing is no longer featured', async () => {
    await asServer();
    await one(`SELECT public.end_spotlight_campaign('${campaignId}', 'job_closed')`);
    const row = await one(`SELECT c.status, c.ended_reason, j.spotlight_until FROM public.spotlight_campaigns c JOIN public.job_listings j ON j.id = c.job_id WHERE c.id = '${campaignId}'`);
    assert.deepEqual([row.status, row.ended_reason, row.spotlight_until], ['ended', 'job_closed', null]);
    assert.equal((await one(`SELECT is_featured FROM public.job_listings WHERE id = '${JOB}'`)).is_featured, false);
    await rejected(`UPDATE public.spotlight_campaigns SET status = 'live' WHERE id = '${campaignId}'`, /cannot be reopened/);
  });

  test('ending a Spotlight never removes an editorial feature', async () => {
    await asServer();
    await db.exec(`UPDATE public.job_listings SET is_featured = true WHERE id = '${JOB_2}'`);
    const { id } = await one(`INSERT INTO public.spotlight_credits (company_id, source, granted_by) VALUES ('${COMPANY}', 'manual', '${ADMIN}') RETURNING id`);
    const { r } = await one(`SELECT public.redeem_spotlight_credit('${id}', '${COMPANY}', '${JOB_2}', current_date, '${OWNER}') AS r`);
    await one(`SELECT public.start_spotlight_campaign('${r.campaignId}')`);
    await one(`SELECT public.end_spotlight_campaign('${r.campaignId}', 'completed')`);
    assert.equal((await one(`SELECT is_featured FROM public.job_listings WHERE id = '${JOB_2}'`)).is_featured, true);
    await db.exec(`UPDATE public.job_listings SET is_featured = false WHERE id = '${JOB_2}'`);
  });

  test('cancelling before go-live returns the credit', async () => {
    await asServer();
    const credit = (await credits()).find((c) => c.source === 'pro_period' && c.status === 'available');
    const { r } = await one(`SELECT public.redeem_spotlight_credit('${credit.id}', '${COMPANY}', '${JOB_2}', current_date, '${OWNER}') AS r`);
    await one(`SELECT public.cancel_spotlight_campaign('${r.campaignId}')`);
    assert.equal((await one(`SELECT status FROM public.spotlight_credits WHERE id = '${credit.id}'`)).status, 'available');
  });
});

describe('refunds and disputes', () => {
  test('refunding an unspent Spotlight freezes its credit and flags the order', async () => {
    await asServer();
    const order = await startOrder('spotlight');
    await spotlight('evt_ref_pay', 'cs_ref', order.reference, { pi: 'pi_refund_me' });
    const result = await one(`SELECT public.reconcile_employer_refund('evt_refund', 'charge.refunded', 'pi_refund_me', 'refunded') AS r`);
    assert.equal(result.r.outcome, 'refunded');
    assert.equal((await one(`SELECT status FROM public.spotlight_credits WHERE order_id = '${order.id}'`)).status, 'frozen');
    assert.deepEqual(Object.values(await one(`SELECT status, needs_review FROM public.employer_orders WHERE id = '${order.id}'`)), ['refunded', true]);
    assert.equal((await one(`SELECT public.reconcile_employer_refund('evt_refund', 'charge.refunded', 'pi_refund_me', 'refunded') AS r`)).r.outcome, 'duplicate');
  });

  test('refunding a Pro month ends access for that month', async () => {
    await asServer();
    assert.equal(await hasPro(), true);
    await one(`SELECT public.reconcile_employer_refund('evt_pro_refund', 'charge.refunded', 'pi_in_1', 'refunded')`);
    assert.equal(await hasPro(), false);
  });

  test('a refund for something else is ignored', async () => {
    await asServer();
    assert.equal((await one(`SELECT public.reconcile_employer_refund('evt_other', 'charge.refunded', 'pi_unknown', 'refunded') AS r`)).r.outcome, 'unrelated');
  });
});

describe('the candidate directory', () => {
  test('is open to every employer while the gate is off', async () => {
    await asBrowser(FREE_OWNER);
    assert.equal((await db.query(`SELECT id FROM public.seeker_profiles`)).rows.length, 1);
  });

  test('once gated, a free employer sees no browsable profiles, but Pro and admins do', async () => {
    await asServer();
    await db.exec(`UPDATE public.employer_billing_settings SET directory_gated = true, gated_at = now()`);
    // COMPANY's Pro month was refunded above; give it a fresh one.
    await invoice('evt_new_month', 'in_new', 'sub_1', iso(-0.5), iso(29.5));
    await asBrowser(FREE_OWNER);
    assert.equal((await db.query(`SELECT id FROM public.seeker_profiles`)).rows.length, 0);
    await asBrowser(OWNER);
    assert.equal((await db.query(`SELECT id FROM public.seeker_profiles`)).rows.length, 1);
  });

  test('once gated, a free employer still sees their own applicants', async () => {
    await asServer();
    await db.exec(`INSERT INTO public.applications (job_id, seeker_id) VALUES ('${FREE_JOB}', '${PROFILE}')`);
    await asBrowser(FREE_OWNER);
    assert.equal((await db.query(`SELECT id FROM public.seeker_profiles`)).rows.length, 1);
  });

  test('hidden candidates stay hidden even from Pro', async () => {
    await asServer();
    await db.exec(`DELETE FROM public.applications; UPDATE public.seeker_profiles SET visibility = 'not_looking'`);
    await asBrowser(OWNER);
    assert.equal((await db.query(`SELECT id FROM public.seeker_profiles`)).rows.length, 0);
  });
});
