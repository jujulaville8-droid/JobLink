import test, {before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {
  setupOutboxDb, actAs, outboxFixture, outboxStore, call, installBudgetConfig, reserveArgs,
} from './helpers/employer-outbox-db.mjs';

// Opt-in, genuine independent PostgreSQL sessions only. Never install or start a
// server here. Use an EXISTING EMPTY disposable localhost database with this exact
// name, separately from the old outbox concurrency suite's database. No PGlite.
const connectionString = process.env.INLINE_BUDGET_TEST_DATABASE_URL;
const enabled = !!connectionString;
if (enabled) {
  const u = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(u.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ||
      u.pathname !== '/joblink_inline_budget_test' || u.search || u.hash) {
    throw new Error('Use an existing empty localhost joblink_inline_budget_test database; URL overrides are not allowed.');
  }
}
const cap = 5_000_000;
const clients = [];
let db;
let ready = false;
async function connect() {
  const c = new Client({connectionString}); await c.connect(); clients.push(c);
  c.exec = sql => c.query(sql); await actAs(c); await c.query("SET statement_timeout='10000ms'"); return c;
}
before(async () => {
  if (!enabled) return;
  db = await connect();
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema'");
  if (tables.rows.length) throw new Error('Inline concurrency database must be empty; existing data is never reset.');
  const roles = (await db.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')")).rows;
  const exec = db.exec;
  db.exec = sql => exec(sql.replace(/CREATE ROLE (anon|authenticated);/g,
    (_, role) => roles.some(x => x.rolname === role) ? '' : `CREATE ROLE ${role};`)
    .replace(/CREATE ROLE service_role BYPASSRLS;/g,
      roles.some(x => x.rolname === 'service_role') ? '' : 'CREATE ROLE service_role BYPASSRLS;'));
  await setupOutboxDb(db); db.exec = exec;
  await db.exec(readFileSync('docs/employer-screening/drafts/employer-inline-budget.unapplied.sql', 'utf8'));
  ready = true;
});
beforeEach(async () => {
  if (!enabled || !ready) return;
  await db.exec(`DELETE FROM employer_delivery.budget_reservations;
    DELETE FROM employer_delivery.inline_attempts; DELETE FROM employer_delivery.budget_days;
    DELETE FROM employer_delivery.budget_months; DELETE FROM employer_delivery.budget_configuration;
    UPDATE employer_delivery.outbox SET state='blocked' WHERE state IN ('pending','claimed','ready','sending');`);
});
after(async () => { await Promise.all(clients.map(c => c.end())); });
const run = (name, fn) => test(name, {skip: !enabled}, fn);
async function inline(config = 'inline-race-v1') {
  await installBudgetConfig(db, {id: config, daily: cap});
  const f = await outboxFixture(db, {enabled: false, attachment: false, rubric: false, register: false});
  return {f, args: {p_application_id: f.app, p_applicant_user_id: f.applicant,
    p_snapshot_sha256: 'a'.repeat(64), p_config_id: config, p_input_token_ceiling: null,
    p_max_output_tokens: 50, p_request_key: `inline:${f.app}`, p_deadline: new Date(Date.now() + 20_000).toISOString()}};
}
const begin = (c, x) => call(c, 'employer_screening_begin_inline', x.args);
const settle = (c, r) => call(c, 'employer_screening_settle_inline', {
  p_reservation_id: r.reservation_id, p_input_tokens: 80, p_output_tokens: 20, p_evidence_id: `usage:${r.reservation_id}`,
});
async function old(config = 'outbox-race-v1') {
  await installBudgetConfig(db, {id: config, daily: cap});
  const f = await outboxFixture(db); const claim = await outboxStore(db).claim(0);
  return {f, args: reserveArgs(f, claim.lease, config)};
}
async function currentMonth() {
  return (await db.query("SELECT date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date::text AS m")).rows[0].m;
}
async function balance(month = undefined) {
  return Number((await db.query("SELECT reserved_microusd FROM employer_delivery.budget_months WHERE scope='joblink-screening-api' AND month=$1", [month ?? await currentMonth()])).rows[0]?.reserved_microusd ?? 0);
}
async function prefill(amount) {
  await db.query(`INSERT INTO employer_delivery.budget_months(month,reserved_microusd) VALUES($1,$2)
    ON CONFLICT(scope,month) DO UPDATE SET reserved_microusd=excluded.reserved_microusd`, [await currentMonth(), amount]);
}
async function waitForLock(c) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const r = (await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [c.processID])).rows[0];
    if (r?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error('Competing PostgreSQL session did not demonstrably wait on a lock');
}
async function race(first, firstAction, second, secondAction) {
  await first.query('BEGIN'); let pending;
  try {
    const winner = await firstAction();
    pending = secondAction().then(value => ({value}), error => ({error}));
    await waitForLock(second); await first.query('COMMIT');
    return [winner, await pending];
  } finally {
    await first.query('ROLLBACK'); if (pending) await pending;
  }
}

run('two independent inline applications cannot both spend the final global allowance', async () => {
  const a = await inline(), b = await inline('different-config'); await prefill(cap - 200);
  const first = await connect(), second = await connect();
  const [winner, loser] = await race(first, () => begin(first, a), second, () => begin(second, b));
  assert.ok(winner); assert.equal(loser.error, undefined); assert.equal(loser.value, null); assert.equal(await balance(), cap);
});

run('inline and old outbox RPCs on different applications share the same last global slot', async () => {
  const a = await inline(), b = await old(); await prefill(cap - 200);
  const first = await connect(), second = await connect();
  const [winner, loser] = await race(first, () => begin(first, a), second,
    () => call(second, 'employer_screening_reserve_budget', b.args));
  assert.ok(winner); assert.equal(loser.error, undefined); assert.equal(loser.value, null); assert.equal(await balance(), cap);
});

// Production RPC eligibility is deliberately disjoint (legacy vs screening).
// This owner-only old-shaped INSERT probes the shared unique index under an
// overlapping transaction without disabling or rewriting production authority.
async function insertOldShape(c, template, application) {
  return c.query(`INSERT INTO employer_delivery.budget_reservations(
    outbox_id,account_id,application_id,config_id,day,month,lease,snapshot_sha256,request_key,model,
    input_microusd_per_million,output_microusd_per_million,input_token_ceiling,max_output_tokens,reserved_microusd,charged_microusd)
    SELECT outbox_id,account_id,$2,config_id,day,month,lease,snapshot_sha256,'old-shaped-fixture',model,
      input_microusd_per_million,output_microusd_per_million,input_token_ceiling,max_output_tokens,reserved_microusd,charged_microusd
    FROM employer_delivery.budget_reservations WHERE id=$1 RETURNING id`, [template.reservation_id, application]);
}
for (const firstPath of ['inline', 'old-shaped']) {
  run(`same-application shared uniqueness survives an overlapping ${firstPath}-first legacy INSERT probe`, async () => {
    const templateInput = await old();
    const template = await call(db, 'employer_screening_reserve_budget', templateInput.args);
    const x = await inline(); const first = await connect(), second = await connect();
    if (firstPath === 'inline') {
      const [winner, loser] = await race(first, () => begin(first, x), second, () => insertOldShape(second, template, x.f.app));
      assert.ok(winner); assert.equal(loser.error?.code, '23505'); assert.equal(await balance(), 400);
    } else {
      // Raw fixture does not itself debit money. The competing real inline RPC
      // must roll back ITS debit and marker after losing the shared unique key.
      const [, loser] = await race(first, () => insertOldShape(first, template, x.f.app), second, () => begin(second, x));
      assert.equal(loser.error, undefined); assert.equal(loser.value, null); assert.equal(await balance(), 200);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.inline_attempts')).rows[0].n, 0);
    }
    assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.budget_reservations WHERE application_id=$1', [x.f.app])).rows[0].n, 1);
  });
}

run('overlapping settlement returns shared-period credit before a new inline reservation', async () => {
  const x = await inline(); const prior = await begin(db, x); const y = await inline('new-config');
  await prefill(cap - 120); const first = await connect(), second = await connect();
  const [settled, next] = await race(first, () => settle(first, prior), second, () => begin(second, y));
  assert.equal(settled, true); assert.equal(next.error, undefined); assert.ok(next.value); assert.equal(await balance(), cap);
});

run('overlapping late settlements refund the original month and never create current-period allowance', async () => {
  const x = await inline(); const prior = await begin(db, x); const current = await currentMonth();
  const oldMonth = (await db.query("SELECT ($1::date-interval '1 month')::date::text AS m", [current])).rows[0].m;
  // Fixture-only historical relocation preserves the full charge in both old ledgers.
  await db.query('UPDATE employer_delivery.budget_months SET month=$2 WHERE month=$1', [current, oldMonth]);
  await db.query('UPDATE employer_delivery.budget_days SET day=$2 WHERE config_id=$1', [x.args.p_config_id, oldMonth]);
  await db.query('UPDATE employer_delivery.budget_reservations SET month=$2,day=$2 WHERE id=$1', [prior.reservation_id, oldMonth]);
  await prefill(cap); const first = await connect(), second = await connect();
  const [winner, repeat] = await race(first, () => settle(first, prior), second, () => settle(second, prior));
  assert.equal(winner, true); assert.equal(repeat.error, undefined); assert.equal(repeat.value, true);
  assert.equal(await balance(oldMonth), 120); assert.equal(await balance(current), cap);
  assert.equal(Number((await db.query('SELECT reserved_microusd FROM employer_delivery.budget_days WHERE config_id=$1 AND day=$2', [x.args.p_config_id, oldMonth])).rows[0].reserved_microusd), 120);
});

run('one-second function lock timeout releases its application lock and restores caller settings', async () => {
  const x = await inline(); await prefill(0);
  const holder = await connect(), contender = await connect(), observer = await connect();
  const before = (await contender.query('SHOW lock_timeout')).rows[0].lock_timeout;
  await holder.query('BEGIN'); let pending;
  try {
    await holder.query("SELECT 1 FROM employer_delivery.budget_months WHERE scope='joblink-screening-api' AND month=$1 FOR UPDATE", [await currentMonth()]);
    const started = Date.now();
    pending = begin(contender, x).then(value => ({value}), error => ({error}));
    await waitForLock(contender); const result = await pending;
    assert.equal(result.error?.code, '55P03');
    assert.ok(Date.now() - started < 5000, 'The bounded lock wait should not run until the outer10-second statement timeout');
    assert.equal((await contender.query('SHOW lock_timeout')).rows[0].lock_timeout, before);
    // The timed-out statement must not leave its earlier application/job locks behind.
    await observer.query('SELECT 1 FROM public.applications WHERE id=$1 FOR UPDATE NOWAIT', [x.f.app]);
    assert.equal(await balance(), 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.inline_attempts')).rows[0].n, 0);
  } finally { await holder.query('ROLLBACK'); if (pending) await pending; }
});
