import test, {before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {
  setupOutboxDb, outboxFixture, outboxStore, installBudgetConfig, reserveArgs,
  call, actAs, uuid,
} from './helpers/employer-outbox-db.mjs';

const sql = readFileSync('docs/employer-screening/drafts/employer-inline-budget.unapplied.sql', 'utf8');
const scope = 'joblink-screening-api';
const cap = 5_000_000;
let db;
before(async () => { db = new PGlite(); await setupOutboxDb(db); await db.exec(sql); });
after(async () => { await db?.close(); });
beforeEach(async () => {
  await actAs(db);
  await db.exec(`DELETE FROM employer_delivery.budget_reservations;
    DELETE FROM employer_delivery.inline_attempts; DELETE FROM employer_delivery.budget_days;
    DELETE FROM employer_delivery.budget_months; DELETE FROM employer_delivery.budget_configuration;`);
});
async function fixture({config = 'inline-synthetic-v1', daily = 1000, c = db, ...options} = {}) {
  await installBudgetConfig(c, {id: config, daily});
  const f = await outboxFixture(c, {enabled: false, attachment: false, rubric: false, register: false, ...options});
  const args = {
    p_application_id: f.app, p_applicant_user_id: f.applicant, p_snapshot_sha256: 'b'.repeat(64),
    p_config_id: config, p_input_token_ceiling: null, p_max_output_tokens: 50,
    p_request_key: `inline:${f.app}:${'b'.repeat(64)}`, p_deadline: new Date(Date.now() + 10_000).toISOString(),
  };
  return {f, args};
}
const begin = (x, patch = {}, c = db) => call(c, 'employer_screening_begin_inline', {...x.args, ...patch});
const settle = (r, patch = {}, c = db) => call(c, 'employer_screening_settle_inline', {
  p_reservation_id: r.reservation_id, p_input_tokens: 80, p_output_tokens: 20,
  p_evidence_id: `usage:${r.reservation_id}`, ...patch,
});
async function month(c = db) { return (await c.query("SELECT date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date::text AS m")).rows[0].m; }
async function balance(m = undefined, c = db) {
  return Number((await c.query('SELECT reserved_microusd FROM employer_delivery.budget_months WHERE scope=$1 AND month=$2', [scope, m ?? await month(c)])).rows[0]?.reserved_microusd ?? 0);
}
async function prefill(amount, c = db) {
  await c.query('INSERT INTO employer_delivery.budget_months(month,reserved_microusd) VALUES($1,$2) ON CONFLICT(scope,month) DO UPDATE SET reserved_microusd=excluded.reserved_microusd', [await month(c), amount]);
}
async function counts(c = db) {
  return (await c.query(`SELECT (SELECT count(*)::int FROM employer_delivery.inline_attempts) AS attempts,
    (SELECT count(*)::int FROM employer_delivery.budget_reservations) AS reservations`)).rows[0];
}
async function reservation(r, c = db) {
  return (await c.query('SELECT *,day::text AS day,month::text AS month FROM employer_delivery.budget_reservations WHERE id=$1', [r.reservation_id])).rows[0];
}

test('inline begin reserves and authorizes once without using or changing the delivery outbox', async () => {
  const x = await fixture();
  // Prove that a pre-existing delivery row is not required by the inline path.
  await db.query('DELETE FROM employer_delivery.outbox WHERE application_id=$1', [x.f.app]);
  const r = await begin(x); assert.ok(r); assert.equal(r.reserved_microusd, 200);
  assert.equal(r.input_token_ceiling, 100); assert.equal(r.max_output_tokens, 50);
  assert.ok(Date.parse(r.dispatch_not_after) <= Date.parse(x.args.p_deadline));
  const row = await reservation(r);
  assert.equal(row.outbox_id, null); assert.equal(row.inline_application_id, x.f.app);
  assert.equal(row.state, 'dispatched'); assert.ok(row.dispatched_at);
  assert.equal(row.snapshot_sha256, x.args.p_snapshot_sha256); assert.equal(row.request_key, x.args.p_request_key);
  assert.equal(await balance(), 200); assert.deepEqual(await counts(), {attempts: 1, reservations: 1});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.outbox WHERE application_id=$1', [x.f.app])).rows[0].n, 0);
  assert.equal(await begin(x), null); assert.equal(await balance(), 200);
  assert.equal(await begin(x, {p_request_key: 'different-request', p_snapshot_sha256: 'c'.repeat(64)}), null);
});

test('inline attempts and outbox attempts share the same persistent fixed five-dollar month', async () => {
  await prefill(cap - 400);
  const x = await fixture(); const r = await begin(x); assert.ok(r);
  const config = await installBudgetConfig(db, {id: 'outbox-other-employer'});
  const f = await outboxFixture(db); const claim = await outboxStore(db).claim(0);
  const old = await call(db, 'employer_screening_reserve_budget', reserveArgs(f, claim.lease, config));
  assert.ok(old); assert.notEqual(f.employer, x.f.employer); assert.equal(await balance(), cap);
  const blocked = await fixture({config: 'inline-new-config'});
  assert.equal(await begin(blocked), null); assert.equal(await balance(), cap);
  assert.deepEqual(await counts(), {attempts: 1, reservations: 2});
});

test('full configured context and output are never reduced to fit remaining allowance', async () => {
  const x = await fixture(); await prefill(cap - 199);
  assert.equal(await begin(x), null); assert.equal(await balance(), cap - 199);
  assert.equal(await begin(x, {p_input_token_ceiling: 99}), null);
  assert.equal(await begin(x, {p_max_output_tokens: 49}), null);
  assert.deepEqual(await counts(), {attempts: 0, reservations: 0});
});

test('daily and per-application bounds remain additional restrictions', async () => {
  const x = await fixture({daily: 199}); assert.equal(await begin(x), null);
  await db.query(`INSERT INTO employer_delivery.budget_configuration
    SELECT 'app-tight',true,true,provider,model,input_microusd_per_million,output_microusd_per_million,
      max_input_tokens,max_output_tokens,199,1000 FROM employer_delivery.budget_configuration WHERE id=$1`, [x.args.p_config_id]);
  assert.equal(await begin(x, {p_config_id: 'app-tight'}), null); assert.equal(await balance(), 0);
});

test('disabled, unverified, non-owned, missing, nonlegacy or banned applicants never reserve', async () => {
  const x = await fixture();
  await db.query('UPDATE employer_delivery.budget_configuration SET enabled=false WHERE id=$1', [x.args.p_config_id]);
  assert.equal(await begin(x), null);
  await db.query('UPDATE employer_delivery.budget_configuration SET enabled=true WHERE id=$1', [x.args.p_config_id]);
  assert.equal(await begin(x, {p_applicant_user_id: uuid()}), null);
  assert.equal(await begin(x, {p_application_id: uuid()}), null);
  assert.equal(await begin(x, {p_config_id: 'missing'}), null);
  assert.equal(await begin(x, {p_snapshot_sha256: 'invalid'}), null);
  assert.equal(await begin(x, {p_request_key: ''}), null);
  const other = await fixture({enabled: true, config: 'another'});
  assert.equal(await begin(other), null);
  await db.query('UPDATE public.users SET is_banned=true WHERE id=$1', [x.f.applicant]);
  assert.equal(await begin(x), null); assert.equal(await balance(), 0);
});

test('active admin-owned contact jobs are eligible, but closed jobs and banned owners are not', async () => {
  const x = await fixture({external: true});
  await db.query("UPDATE public.users SET role='admin',is_admin=true WHERE id=$1", [x.f.employer]);
  await db.query('UPDATE public.job_listings SET posted_by_admin=true WHERE id=$1', [x.f.job]);
  const r = await begin(x); assert.ok(r); assert.equal(await balance(), 200);
  assert.equal((await reservation(r)).account_id, x.f.employer);
  const closed = await fixture({external: true});
  await db.query("UPDATE public.job_listings SET status='closed' WHERE id=$1", [closed.f.job]);
  assert.equal(await begin(closed), null);
  const banned = await fixture({external: true});
  await db.query("UPDATE public.users SET role='admin',is_admin=true,is_banned=true WHERE id=$1", [banned.f.employer]);
  assert.equal(await begin(banned), null);
  assert.equal(await balance(), 200); assert.deepEqual(await counts(), {attempts: 1, reservations: 1});
});

test('unknown provider outcomes and crash-after-begin retain full holds and cannot release or restart', async () => {
  const x = await fixture(); const r = await begin(x); const row = await reservation(r);
  assert.equal(await call(db, 'employer_screening_release_budget', {p_reservation_id: r.reservation_id, p_lease: row.lease}), false);
  assert.equal(await call(db, 'employer_screening_start_request', {p_reservation_id: r.reservation_id, p_lease: row.lease}), false);
  assert.equal(await settle(r, {p_input_tokens: null, p_output_tokens: null, p_evidence_id: null}), false);
  assert.equal((await reservation(r)).state, 'uncertain'); assert.equal(await balance(), 200);
  assert.equal(await begin(x), null);
  await db.query('UPDATE employer_delivery.budget_configuration SET enabled=false WHERE id=$1', [x.args.p_config_id]);
  await db.query('DELETE FROM public.applications WHERE id=$1', [x.f.app]);
  assert.equal(await balance(), 200); assert.deepEqual(await counts(), {attempts: 1, reservations: 1});
});

test('bounded trusted usage settles idempotently using immutable original rates', async () => {
  const x = await fixture(); const r = await begin(x);
  assert.equal(await settle(r, {p_input_tokens: 101}), false); assert.equal(await balance(), 200);
  assert.equal(await settle(r, {p_evidence_id: ''}), false); assert.equal(await balance(), 200);
  assert.equal(await settle(r), true); assert.equal(await balance(), 120);
  assert.equal(await settle(r), true); assert.equal(await balance(), 120);
  assert.equal(await settle(r, {p_input_tokens: 1}), false); assert.equal(await balance(), 120);
  assert.equal(await begin(x), null);
});

test('inline and old path share receipt uniqueness; a duplicate receipt rolls back both refunds', async () => {
  const config = await installBudgetConfig(db); const f = await outboxFixture(db);
  const claim = await outboxStore(db).claim(0);
  const old = await call(db, 'employer_screening_reserve_budget', reserveArgs(f, claim.lease, config));
  await call(db, 'employer_screening_start_request', {p_reservation_id: old.reservation_id, p_lease: claim.lease});
  await call(db, 'employer_screening_settle_budget', {p_reservation_id: old.reservation_id, p_input_tokens: 80, p_output_tokens: 20, p_evidence_id: 'one-receipt'});
  const x = await fixture(); const r = await begin(x); assert.equal(await balance(), 320);
  await assert.rejects(settle(r, {p_evidence_id: 'one-receipt'}), /duplicate key/);
  assert.equal(await balance(), 320); assert.equal(Number((await reservation(r)).charged_microusd), 200);
  assert.equal(await settle(old), false);
});

test('shared application uniqueness rejects cross-path histories and new conflicts', async () => {
  const config = await installBudgetConfig(db); const f = await outboxFixture(db);
  const claim = await outboxStore(db).claim(0);
  const old = await call(db, 'employer_screening_reserve_budget', reserveArgs(f, claim.lease, config));
  const x = await fixture();
  // Owner-only synthetic historical cross-path row. Runtime has no direct table access.
  await db.query('UPDATE employer_delivery.budget_reservations SET application_id=$2 WHERE id=$1', [old.reservation_id, x.f.app]);
  assert.equal(await begin(x), null); assert.equal(await balance(), 200);
  const y = await fixture(); const r = await begin(y); assert.ok(r);
  await assert.rejects(db.query(`INSERT INTO employer_delivery.budget_reservations(
    outbox_id,account_id,application_id,config_id,day,month,lease,snapshot_sha256,request_key,model,
    input_microusd_per_million,output_microusd_per_million,input_token_ceiling,max_output_tokens,reserved_microusd,charged_microusd)
    SELECT $2,account_id,application_id,config_id,day,month,lease,snapshot_sha256,'conflicting-outbox',model,
      input_microusd_per_million,output_microusd_per_million,input_token_ceiling,max_output_tokens,reserved_microusd,charged_microusd
    FROM employer_delivery.budget_reservations WHERE id=$1`, [r.reservation_id, f.id]), /duplicate key/);
  assert.equal(await balance(), 400); assert.deepEqual(await counts(), {attempts: 1, reservations: 2});
});

test('null outbox provenance cannot be forged or changed into a refundable pre-dispatch state', async () => {
  const x = await fixture(); const r = await begin(x);
  await assert.rejects(db.query("UPDATE employer_delivery.budget_reservations SET state='reserved' WHERE id=$1", [r.reservation_id]), /check constraint/);
  await assert.rejects(db.query('UPDATE employer_delivery.budget_reservations SET inline_application_id=NULL WHERE id=$1', [r.reservation_id]), /check constraint/);
  await assert.rejects(db.query('UPDATE employer_delivery.budget_reservations SET application_id=$2 WHERE id=$1', [r.reservation_id, uuid()]), /check constraint/);
  await assert.rejects(db.query('UPDATE employer_delivery.budget_reservations SET dispatched_at=NULL WHERE id=$1', [r.reservation_id]), /check constraint/);
  assert.equal(await balance(), 200);
});

test('late settlements refund only the original UTC month and day', async () => {
  const x = await fixture(); const r = await begin(x);
  const current = await month(); const previous = (await db.query("SELECT ($1::date-interval '1 month')::date::text AS m", [current])).rows[0].m;
  await db.query('UPDATE employer_delivery.budget_months SET month=$2 WHERE month=$1', [current, previous]);
  await db.query('UPDATE employer_delivery.budget_days SET day=$2 WHERE config_id=$1', [x.args.p_config_id, previous]);
  await db.query('UPDATE employer_delivery.budget_reservations SET month=$2,day=$2 WHERE id=$1', [r.reservation_id, previous]);
  await prefill(cap); assert.equal(await settle(r), true);
  assert.equal(await balance(previous), 120); assert.equal(await balance(current), cap);
});

test('deadline is bounded, non-finite/expired requests fail closed, and session timezone does not change UTC accounting', async () => {
  const x = await fixture();
  assert.equal(await begin(x, {p_deadline: new Date(Date.now() - 1000).toISOString()}), null);
  assert.equal(await begin(x, {p_deadline: 'infinity'}), null);
  await db.exec("SET TIME ZONE 'Pacific/Kiritimati'");
  try {
    const before = Date.now(); const r = await begin(x, {p_deadline: new Date(before + 3600_000).toISOString()});
    assert.ok(r); assert.ok(Date.parse(r.dispatch_not_after) <= before + 30_100);
    const row = await reservation(r); assert.equal(row.month, await month());
    assert.equal(row.day, (await db.query("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS d")).rows[0].d);
  } finally { await db.exec("SET TIME ZONE 'UTC'"); }
});

test('private inline evidence is inaccessible directly; only service role can invoke RPCs', async () => {
  const x = await fixture();
  for (const role of ['anon', 'authenticated']) {
    await actAs(db, x.f.applicant, role, role);
    await assert.rejects(begin(x), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM employer_delivery.inline_attempts'), /permission denied/);
    await assert.rejects(settle({reservation_id: uuid()}), /permission denied/);
  }
  await actAs(db, '', 'service_role', 'service_role');
  await assert.rejects(db.query('INSERT INTO employer_delivery.inline_attempts VALUES($1,clock_timestamp())', [uuid()]), /permission denied/);
  const r = await begin(x); assert.ok(r); assert.equal(await settle(r), true);
  await actAs(db);
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='employer_delivery.inline_attempts'::regclass")).rows[0].relrowsecurity, true);
});

test('additive install preserves disabled configs and existing reservation/ledger history exactly', async () => {
  const c = new PGlite();
  try {
    await setupOutboxDb(c); const config = await installBudgetConfig(c);
    const f = await outboxFixture(c); const claim = await outboxStore(c).claim(0);
    const r = await call(c, 'employer_screening_reserve_budget', reserveArgs(f, claim.lease, config));
    await c.query('UPDATE employer_delivery.budget_configuration SET enabled=false');
    const before = await reservation(r, c);
    const funcs = await c.query("SELECT proname,prosrc FROM pg_proc WHERE proname IN ('employer_screening_reserve_budget','employer_screening_start_request','employer_screening_settle_budget','employer_screening_release_budget') ORDER BY proname");
    await c.exec(sql); const after = await reservation(r, c); delete after.inline_application_id;
    assert.deepEqual(after, before); assert.equal(await balance(undefined, c), 200);
    assert.equal((await c.query('SELECT enabled FROM employer_delivery.budget_configuration')).rows[0].enabled, false);
    assert.deepEqual((await c.query("SELECT proname,prosrc FROM pg_proc WHERE proname IN ('employer_screening_reserve_budget','employer_screening_start_request','employer_screening_settle_budget','employer_screening_release_budget') ORDER BY proname")).rows, funcs.rows);
  } finally { await c.close(); }
});

test('install refuses enabled paid configurations atomically', async () => {
  const c = new PGlite();
  try {
    await setupOutboxDb(c); await installBudgetConfig(c);
    await assert.rejects(c.exec(sql), /DISABLE_PAID_CONFIGURATIONS_BEFORE_INLINE_INSTALL/);
    await c.exec('ROLLBACK');
    assert.equal((await c.query("SELECT to_regclass('employer_delivery.inline_attempts') AS t")).rows[0].t, null);
    assert.equal((await c.query("SELECT attnotnull FROM pg_attribute WHERE attrelid='employer_delivery.budget_reservations'::regclass AND attname='outbox_id'")).rows[0].attnotnull, true);
    assert.equal((await c.query('SELECT enabled FROM employer_delivery.budget_configuration')).rows[0].enabled, true);
  } finally { await c.close(); }
});

// Deterministic, disposable PGlite clock fixture only. It exercises the actual
// production function branches but is NOT evidence of independent-session locks.
// No production clock parameter exists and the exact definition is restored.
async function withInlineClock(stamps, run) {
  const signature = 'public.employer_screening_begin_inline(uuid,uuid,text,text,integer,integer,text,timestamptz)';
  const original = (await db.query('SELECT pg_get_functiondef($1::regprocedure) AS definition', [signature])).rows[0].definition;
  await db.exec(`CREATE SCHEMA inline_budget_test;
    CREATE TABLE inline_budget_test.position(n integer NOT NULL); INSERT INTO inline_budget_test.position VALUES(0);
    CREATE TABLE inline_budget_test.stamps(n integer PRIMARY KEY, stamp timestamptz NOT NULL);
    CREATE FUNCTION inline_budget_test.clock() RETURNS timestamptz LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
    DECLARE position integer; result timestamptz;
    BEGIN
      UPDATE inline_budget_test.position SET n=n+1 RETURNING n INTO position;
      SELECT stamp INTO STRICT result FROM inline_budget_test.stamps WHERE n=position;
      RETURN result;
    END $$;`);
  try {
    for (const [index, stamp] of stamps.entries()) await db.query('INSERT INTO inline_budget_test.stamps VALUES($1,$2)', [index + 1, stamp]);
    assert.match(original, /clock_timestamp\(\)/);
    await db.exec(original.replace(/(?:pg_catalog\.)?clock_timestamp\(\)/g, 'inline_budget_test.clock()'));
    await run();
  } finally {
    await db.exec(original);
    await db.exec('DROP SCHEMA inline_budget_test CASCADE');
  }
}

test('post-ledger-lock clock fences reject both UTC day and month rollover before authorization', async () => {
  for (const day of ['2030-01-15', '2030-01-31']) {
    const x = await fixture();
    const start = `${day}T23:59:59.500Z`;
    const next = new Date(Date.parse(start) + 1000).toISOString();
    await withInlineClock([start, next], async () => {
      assert.equal(await begin(x, {p_deadline: new Date(Date.parse(next) + 10_000).toISOString()}), null);
    });
    assert.equal(Number((await db.query('SELECT coalesce(sum(reserved_microusd),0) AS total FROM employer_delivery.budget_months')).rows[0].total), 0);
    assert.deepEqual(await counts(), {attempts: 0, reservations: 0});
  }
});

test('cutoff crossed after reservation insertion rolls back both ledger debits and inline evidence', async () => {
  const x = await fixture();
  await withInlineClock(['2030-01-31T23:59:59.500Z', '2030-01-31T23:59:59.600Z', '2030-02-01T00:00:00.001Z'], async () => {
    assert.equal(await begin(x, {p_deadline: '2030-02-01T00:00:10Z'}), null);
  });
  assert.deepEqual(await counts(), {attempts: 0, reservations: 0});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.budget_months')).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.budget_days')).rows[0].n, 0);
});

test('successful authorization immediately before UTC midnight returns midnight cutoff without borrowing next month', async () => {
  const x = await fixture();
  await withInlineClock(['2030-01-31T23:59:59.500Z', '2030-01-31T23:59:59.600Z', '2030-01-31T23:59:59.700Z'], async () => {
    const r = await begin(x, {p_deadline: '2030-02-01T00:00:10Z'}); assert.ok(r);
    assert.equal(Date.parse(r.dispatch_not_after), Date.parse('2030-02-01T00:00:00Z'));
    const row = await reservation(r); assert.equal(row.day, '2030-01-31'); assert.equal(row.month, '2030-01-01');
    assert.equal(await balance('2030-01-01'), 200); assert.equal(await balance('2030-02-01'), 0);
  });
});

test('verified full-context config reserves exactly 231845 microUSD; the twenty-second unknown call cannot fit', async () => {
  // Exact existing disabled configuration values, copied into this disposable
  // fixture and enabled only here. This test does not read or alter a live DB.
  const config = 'gpt-6-luna-20261021-full-context-v1';
  await db.query(`INSERT INTO employer_delivery.budget_configuration VALUES
    ($1,true,true,'openai','gpt-6-luna',220000,825000,1050000,1024,231845,5000000)`, [config]);
  for (let i = 0; i < 22; i++) {
    const x = await fixture({config});
    const r = await begin(x, {p_max_output_tokens: 1024});
    if (i < 21) {
      assert.equal(r?.reserved_microusd, 231845); assert.equal(r?.input_token_ceiling, 1050000);
    } else assert.equal(r, null);
  }
  assert.equal(await balance(), 4_868_745); assert.deepEqual(await counts(), {attempts: 21, reservations: 21});
});


test('inline RPCs carry a one-second lock-wait bound without leaking caller settings', async () => {
  const configs = (await db.query("SELECT proname,proconfig FROM pg_proc WHERE proname IN ('employer_screening_begin_inline','employer_screening_settle_inline')")).rows;
  assert.equal(configs.length, 2);
  for (const row of configs) assert.ok(row.proconfig.includes('lock_timeout=1s'));
  const before = (await db.query('SHOW lock_timeout')).rows[0].lock_timeout;
  const x = await fixture(); const r = await begin(x); assert.ok(r); assert.equal(await settle(r), true);
  assert.equal((await db.query('SHOW lock_timeout')).rows[0].lock_timeout, before);
});
