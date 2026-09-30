import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { setupClaimsDb, actAs, fixture, user, loadSql } from './helpers/claims-db.mjs';

let db;
before(async () => { db = new PGlite(); await setupClaimsDb(db); });
after(async () => { await db?.close(); });
const claim = f => db.query('SELECT * FROM public.claim_company($1, $2)', [f.token, f.employer]);

async function unchanged(f) {
  const { rows: [row] } = await db.query(`SELECT c.user_id, c.claimed_at, cc.claimed_by,
    u.is_banned, a.banned_until FROM public.companies c JOIN public.company_claims cc ON cc.company_id=c.id
    JOIN public.users u ON u.id=c.user_id JOIN auth.users a ON a.id=u.id WHERE c.id=$1`, [f.company]);
  assert.equal(row.user_id, f.placeholder); assert.equal(row.claimed_at, null);
  assert.equal(row.claimed_by, null); assert.equal(row.is_banned, false); assert.equal(row.banned_until, null);
}

test('migration is idempotent', async () => { await db.exec(loadSql('supabase/migrations/20260930_company_claims.sql')); });
test('transfers company and job access, keeps history, consumes token and disables Auth atomically', async () => {
  const f = await fixture(db);
  await claim(f);
  const { rows: [row] } = await db.query(`SELECT c.user_id, c.claimed_at, j.id, j.posted_by_admin, j.status,
    cc.claimed_by, cc.claimed_at as consumed_at FROM public.companies c JOIN public.job_listings j ON j.company_id=c.id
    JOIN public.company_claims cc ON cc.company_id=c.id WHERE c.id=$1`, [f.company]);
  assert.equal(row.user_id, f.employer); assert.equal(row.id, f.job); assert.equal(row.status, 'active');
  assert.equal(row.posted_by_admin, true); assert.equal(row.claimed_by, f.employer);
  assert.ok(row.claimed_at); assert.deepEqual(row.claimed_at, row.consumed_at);
  const { rows: [disabled] } = await db.query(`SELECT u.is_banned, u.email_verified, a.banned_until = '9999-12-31 23:59:59+00'::timestamptz as auth_banned,
    (SELECT count(*)::int FROM auth.sessions WHERE user_id=u.id) AS sessions,
    (SELECT count(*)::int FROM auth.refresh_tokens WHERE user_id=u.id::text) AS refresh_tokens
    FROM public.users u JOIN auth.users a ON a.id=u.id WHERE u.id=$1`, [f.placeholder]);
  assert.deepEqual(disabled, { is_banned: true, email_verified: false, auth_banned: true, sessions: 0, refresh_tokens: 0 });
  await actAs(db, f.employer, 'authenticated', 'authenticated');
  assert.equal((await db.query(`UPDATE public.job_listings SET salary_min=1500 WHERE id=$1 RETURNING id`, [f.job])).rows.length, 1);
  await actAs(db, f.placeholder, 'authenticated', 'authenticated');
  assert.equal((await db.query(`UPDATE public.job_listings SET salary_min=9999 WHERE id=$1 RETURNING id`, [f.job])).rows.length, 0);
  await actAs(db);
  await assert.rejects(claim(f), /CLAIM_UNAVAILABLE/);
});
test('expired and unknown tokens fail without side effects', async () => {
  const f = await fixture(db);
  await db.query(`UPDATE public.company_claims SET expires_at=clock_timestamp() - interval '1 second' WHERE token=$1`, [f.token]);
  await assert.rejects(claim(f), /CLAIM_UNAVAILABLE/); await unchanged(f);
  await assert.rejects(claim({ ...f, token: 'X'.repeat(43) }), /CLAIM_UNAVAILABLE/);
});
test('default expiry is 30 days; token format and uniqueness are enforced', async () => {
  const f = await fixture(db);
  const { rows: [r] } = await db.query('SELECT expires_at-created_at AS lifetime FROM public.company_claims WHERE token=$1', [f.token]);
  assert.match(String(r.lifetime), /30 days/);
  await assert.rejects(db.query('SELECT public.create_company_claim($1,$2,$3)', [f.company, f.admin, f.token]), /unique/);
  await assert.rejects(db.query('SELECT public.create_company_claim($1,$2,$3)', [f.company, f.admin, 'short']), /check constraint/);
});
test('rejects seeker, suspended, placeholder and unverified claimants', async () => {
  for (const kind of ['seeker', 'banned', 'placeholder', 'unverified', 'auth-unverified']) {
    const f = await fixture(db);
    if (kind === 'seeker') await db.query("UPDATE public.users SET role='seeker' WHERE id=$1", [f.employer]);
    if (kind === 'banned') await db.query('UPDATE public.users SET is_banned=true WHERE id=$1', [f.employer]);
    if (kind === 'placeholder') f.employer = f.placeholder;
    if (kind === 'unverified') await db.query('UPDATE public.users SET email_verified=false WHERE id=$1', [f.employer]);
    if (kind === 'auth-unverified') await db.query('UPDATE auth.users SET email_confirmed_at=null WHERE id=$1', [f.employer]);
    await assert.rejects(claim(f), /EMPLOYER_REQUIRED|EMAIL_UNVERIFIED/); await unchanged(f);
  }
});
test('rejects an employer already owning a different company', async () => {
  const f = await fixture(db);
  await db.query("INSERT INTO public.companies(user_id,company_name) VALUES ($1,'Already owned')", [f.employer]);
  await assert.rejects(claim(f), /COMPANY_ALREADY_OWNED/); await unchanged(f);
});
test('rechecks changed owner and invalidates all other links after a claim', async () => {
  const f = await fixture(db);
  await db.query('SELECT public.create_company_claim($1,$2,$3)', [f.company, f.admin, 'R'.repeat(43)]);
  await claim(f);
  await assert.rejects(claim({ ...f, employer: await user(db), token: 'R'.repeat(43) }), /CLAIM_UNAVAILABLE/);
  const changed = await fixture(db);
  await db.query('UPDATE public.companies SET user_id=$1 WHERE id=$2', [await user(db), changed.company]);
  await assert.rejects(claim(changed), /CLAIM_UNAVAILABLE/);
});
test('rolls back ownership and token use when placeholder disabling fails', async () => {
  const f = await fixture(db);
  await db.exec(`CREATE FUNCTION auth.test_refuse_ban() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$;
    CREATE TRIGGER test_refuse_ban BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.test_refuse_ban();`);
  try { await assert.rejects(claim(f), /fixture failure/); await unchanged(f); }
  finally { await db.exec('DROP TRIGGER test_refuse_ban ON auth.users; DROP FUNCTION auth.test_refuse_ban();'); }
});
test('only admins can read or write tokens and only service_role can call either RPC', async () => {
  const f = await fixture(db);
  await actAs(db, f.employer, 'authenticated', 'authenticated');
  assert.equal((await db.query('SELECT * FROM public.company_claims')).rows.length, 0);
  await assert.rejects(db.query('SELECT * FROM public.claim_company($1,$2)', [f.token, f.employer]), /permission denied/);
  await assert.rejects(db.query('SELECT public.create_company_claim($1,$2,$3)', [f.company, f.admin, 'A'.repeat(43)]), /permission denied/);
  await assert.rejects(db.query('INSERT INTO public.company_claims(company_id,token,created_by) VALUES ($1,$2,$3)', [f.company, 'A'.repeat(43), f.employer]), /row-level security/);
  await actAs(db, f.admin, 'authenticated', 'authenticated');
  assert.equal((await db.query('SELECT * FROM public.company_claims WHERE token=$1', [f.token])).rows.length, 1);
  await db.query('UPDATE public.company_claims SET email_hint=$1 WHERE token=$2', ['optional@example.test', f.token]);
  await actAs(db, '', 'anon', 'anon');
  await assert.rejects(db.query('SELECT * FROM public.company_claims'), /permission denied/);
  await actAs(db);
  await assert.rejects(db.query('SELECT public.create_company_claim($1,$2,$3)', [f.company, f.employer, 'A'.repeat(43)]), /FORBIDDEN/);
});
test('case-insensitive exact-name duplicate prevention applies to direct inserts and rename', async () => {
  const f = await fixture(db, 'Claim 100%_Co');
  await actAs(db, f.employer, 'authenticated', 'authenticated');
  await assert.rejects(db.query('INSERT INTO public.companies(user_id,company_name) VALUES ($1,$2)', [f.employer, '  cLaIm 100%_cO  ']), /COMPANY_CLAIM_REQUIRED/);
  await db.query('INSERT INTO public.companies(user_id,company_name) VALUES ($1,$2)', [f.employer, 'Claim 100x_Co']);
  await assert.rejects(db.query('UPDATE public.companies SET company_name=$1 WHERE user_id=$2', ['Claim 100%_Co', f.employer]), /COMPANY_CLAIM_REQUIRED/);
  await assert.rejects(db.query('UPDATE public.companies SET claimed_at=now() WHERE user_id=$1', [f.employer]), /managed by the server/);
  await actAs(db);
});
