import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { setupClaimsDb, actAs, fixture, user } from './helpers/claims-db.mjs';

// Destructive fixture setup is only allowed in a dedicated LOCAL test database.
const connectionString = process.env.CLAIMS_TEST_DATABASE_URL;
const enabled = !!connectionString;
if (enabled) {
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/joblink_claims_test') {
    throw new Error('Use a fresh local database named joblink_claims_test only.');
  }
}
let db;
const clients = [];
async function connect() {
  const client = new Client({ connectionString });
  await client.connect();
  client.exec = sql => client.query(sql);
  clients.push(client);
  return client;
}
before(async () => {
  if (!enabled) return;
  db = await connect();
  const { rows } = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  if (rows.length) throw new Error('Test database must be empty. Recreate the local fixture database.');
  await setupClaimsDb(db);
});
after(async () => { await Promise.all(clients.map(client => client.end())); });
const runClaim = (client, token, employer) => client.query('SELECT * FROM public.claim_company($1,$2)', [token, employer]);

// A held company lock ensures both real PostgreSQL connections overlap.
// pg_stat_activity proves the loser was actually waiting, not just sequential.
async function waitForLock(client) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows: [row] } = await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [client.processID]);
    if (row?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Expected competing connection to wait on the transaction lock');
}

for (const separateTokens of [false, true]) {
  test(`only one employer wins concurrent ${separateTokens ? 'different links for one company' : 'redemptions of the same link'}`, { skip: !enabled }, async () => {
    const f = await fixture(db);
    const other = await user(db);
    const token2 = separateTokens ? 'S'.repeat(43) : f.token;
    if (separateTokens) await db.query('SELECT public.create_company_claim($1,$2,$3)', [f.company, f.admin, token2]);
    const winner = await connect(), loser = await connect();
    await actAs(winner); await actAs(loser);
    await winner.query('BEGIN');
    await runClaim(winner, f.token, f.employer);
    const competing = runClaim(loser, token2, other).then(() => null, error => error);
    await waitForLock(loser);
    await winner.query('COMMIT');
    assert.match((await competing)?.message ?? '', /CLAIM_UNAVAILABLE/);
    assert.equal((await db.query('SELECT user_id FROM public.companies WHERE id=$1', [f.company])).rows[0].user_id, f.employer);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.company_claims WHERE company_id=$1 AND claimed_at IS NOT NULL', [f.company])).rows[0].count, 1);
  });
}

test('one employer cannot concurrently claim two companies', { skip: !enabled }, async () => {
  const f = await fixture(db), other = await fixture(db);
  const first = await connect(), second = await connect();
  await actAs(first); await actAs(second);
  await first.query('BEGIN'); await runClaim(first, f.token, f.employer);
  const competing = runClaim(second, other.token, f.employer).then(() => null, error => error);
  await waitForLock(second); await first.query('COMMIT');
  assert.match((await competing)?.message ?? '', /COMPANY_ALREADY_OWNED/);
  assert.equal((await db.query('SELECT user_id FROM public.companies WHERE id=$1', [other.company])).rows[0].user_id, other.placeholder);
});

test('expiry is rechecked after waiting for a company lock', { skip: !enabled }, async () => {
  const f = await fixture(db);
  await db.query("UPDATE public.company_claims SET expires_at=clock_timestamp()+interval '500 milliseconds' WHERE token=$1", [f.token]);
  const blocker = await connect(), claimant = await connect();
  await actAs(blocker); await actAs(claimant);
  await blocker.query('BEGIN'); await blocker.query('SELECT id FROM public.companies WHERE id=$1 FOR UPDATE', [f.company]);
  const waiting = runClaim(claimant, f.token, f.employer).then(() => null, error => error);
  await waitForLock(claimant);
  await blocker.query('SELECT pg_sleep(0.6)'); await blocker.query('COMMIT');
  assert.match((await waiting)?.message ?? '', /CLAIM_UNAVAILABLE/);
  assert.equal((await db.query('SELECT user_id FROM public.companies WHERE id=$1', [f.company])).rows[0].user_id, f.placeholder);
});

test('concurrent profile creation cannot give claimant a second company', { skip: !enabled }, async () => {
  const f = await fixture(db);
  const creator = await connect(), claimant = await connect();
  await actAs(creator, f.employer, 'authenticated', 'authenticated'); await actAs(claimant);
  await creator.query('BEGIN');
  await creator.query("INSERT INTO public.companies(user_id,company_name) VALUES ($1,'Different new company')", [f.employer]);
  const waiting = runClaim(claimant, f.token, f.employer).then(() => null, error => error);
  await waitForLock(claimant); await creator.query('COMMIT');
  const error = await waiting;
  assert.ok(error?.code === '23505' || error?.message === 'COMPANY_ALREADY_OWNED');
  assert.equal((await db.query('SELECT user_id FROM public.companies WHERE id=$1', [f.company])).rows[0].user_id, f.placeholder);
});
