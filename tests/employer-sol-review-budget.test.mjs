import test, {describe, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {Client} from 'pg';
import {
  setupOutboxDb, outboxFixture, outboxStore, installBudgetConfig, reserveArgs,
  call, actAs, uuid,
} from './helpers/employer-outbox-db.mjs';

const inlineSql = readFileSync('docs/employer-screening/drafts/employer-inline-budget.unapplied.sql', 'utf8');
const sql = readFileSync('docs/employer-screening/drafts/employer-sol-review-v2-upgrade.unapplied.sql', 'utf8');
const configId = 'gpt-6.1-sol-20261022-counted-v2';
const scope = 'joblink-screening-api';
const cap = 5_000_000;
const maxReserve = 121_792;
const halfReserve = 60_896;
const signature = 'public.employer_screening_begin_inline_v2(uuid,uuid,text,text,text,integer,integer,text,text,timestamptz,uuid)';
const claimSignature = 'public.employer_screening_claim_review_v2(uuid,uuid,text,text,text,timestamptz)';
const beginKeys = [
  'p_application_id', 'p_applicant_user_id', 'p_snapshot_sha256', 'p_config_id', 'p_model',
  'p_input_token_count', 'p_max_output_tokens', 'p_request_key', 'p_request_sha256', 'p_deadline', 'p_preflight_nonce',
];
// This new fixed function has a version digit. Do not weaken the legacy helper's
// function-name allowlist merely to call it from a synthetic test fixture.
async function claim(db, x, patch = {}) {
  const args = {...x.args, ...patch};
  const keys = ['p_application_id', 'p_applicant_user_id', 'p_snapshot_sha256', 'p_config_id', 'p_request_sha256', 'p_deadline'];
  return (await db.query(`SELECT public.employer_screening_claim_review_v2(
    ${keys.map((key, index) => `${key} => $${index + 1}`).join(',')}) AS value`, keys.map(key => args[key]))).rows[0].value;
}
// Convenience for generation-accounting cases: claim once before simulated
// counting, then call begin. Separate claim/rawBegin tests verify the boundary.
async function begin(db, x, patch = {}) {
  if (!x.preflight) x.preflight = await claim(db, x, patch);
  if (!x.preflight) return null;
  return rawBegin(db, x, {...patch, p_preflight_nonce: patch.p_preflight_nonce ?? x.preflight.preflight_nonce});
}
async function rawBegin(db, x, patch = {}) {
  const args = {...x.args, p_preflight_nonce: null, ...patch};
  return (await db.query(`SELECT public.employer_screening_begin_inline_v2(
    ${beginKeys.map((key, index) => `${key} => $${index + 1}`).join(',')}) AS value`,
  beginKeys.map(key => args[key]))).rows[0].value;
}
async function installSol(db, overrides = {}) {
  const c = {id: configId, enabled: true, verified: true, provider: 'openai', model: 'gpt-6.1-sol',
    inputRate: 5_500_000, outputRate: 16_500_000, maxInput: 16_000, maxOutput: 2048,
    perApplication: maxReserve, daily: cap, ...overrides};
  await db.query(`INSERT INTO employer_delivery.budget_configuration VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`, Object.values(c));
  return c.id;
}
async function fixture(db, {config = configId, input = 16000, ...options} = {}) {
  await installSol(db, {id: config});
  const f = await outboxFixture(db, {enabled: false, attachment: false, rubric: false, register: false, ...options});
  return {f, args: {p_application_id: f.app, p_applicant_user_id: f.applicant,
    p_snapshot_sha256: 'a'.repeat(64), p_config_id: config, p_model: 'gpt-6.1-sol',
    p_input_token_count: input, p_max_output_tokens: 2048, p_request_key: `inline-v2:${f.app}`,
    p_request_sha256: 'b'.repeat(64), p_deadline: new Date(Date.now() + 20_000).toISOString()}};
}
async function legacyInline(db, config = 'luna-inline') {
  await installBudgetConfig(db, {id: config, daily: cap});
  const f = await outboxFixture(db, {enabled: false, attachment: false, rubric: false, register: false});
  return {f, args: {p_application_id: f.app, p_applicant_user_id: f.applicant,
    p_snapshot_sha256: 'c'.repeat(64), p_config_id: config, p_input_token_ceiling: null,
    p_max_output_tokens: 50, p_request_key: `inline:${f.app}`,
    p_deadline: new Date(Date.now() + 20_000).toISOString()}};
}
const beginLegacy = (db, x) => call(db, 'employer_screening_begin_inline', x.args);
async function legacyOutbox(db, config = 'luna-outbox') {
  await installBudgetConfig(db, {id: config, daily: cap});
  const f = await outboxFixture(db);
  const claim = await outboxStore(db).claim(0);
  return {f, args: reserveArgs(f, claim.lease, config)};
}
const beginOutbox = (db, x) => call(db, 'employer_screening_reserve_budget', x.args);
const settle = (db, r, patch = {}) => call(db, 'employer_screening_settle_inline', {
  p_reservation_id: r.reservation_id, p_input_tokens: 8000, p_output_tokens: 1024,
  p_evidence_id: `sol-usage:${r.reservation_id}`, ...patch,
});
async function month(db) {
  return (await db.query("SELECT date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date::text AS m")).rows[0].m;
}
async function balance(db, m = undefined) {
  return Number((await db.query('SELECT reserved_microusd FROM employer_delivery.budget_months WHERE scope=$1 AND month=$2',
    [scope, m ?? await month(db)])).rows[0]?.reserved_microusd ?? 0);
}
async function prefill(db, amount) {
  await db.query(`INSERT INTO employer_delivery.budget_months(month,reserved_microusd) VALUES($1,$2)
    ON CONFLICT(scope,month) DO UPDATE SET reserved_microusd=excluded.reserved_microusd`, [await month(db), amount]);
}
async function counts(db) {
  return (await db.query(`SELECT (SELECT count(*)::int FROM employer_delivery.inline_attempts) AS attempts,
    (SELECT count(*)::int FROM employer_delivery.budget_reservations) AS reservations`)).rows[0];
}
async function row(db, r) {
  return (await db.query('SELECT *,day::text AS day,month::text AS month FROM employer_delivery.budget_reservations WHERE id=$1', [r.reservation_id])).rows[0];
}
async function clearSyntheticBudget(db) {
  await actAs(db);
  await db.exec(`DELETE FROM employer_delivery.budget_reservations;
    DELETE FROM employer_delivery.inline_attempts; DELETE FROM employer_delivery.budget_days;
    DELETE FROM employer_delivery.budget_months; DELETE FROM employer_delivery.budget_configuration;`);
}
async function setup(db) { await setupOutboxDb(db); await db.exec(inlineSql); await db.exec(sql); }

// PGlite verifies executed SQL branches, not independent-session lock behavior.
describe('Sol v2 budget SQL in disposable PGlite', () => {
  let db;
  before(async () => { db = new PGlite(); await setup(db); });
  after(async () => { await db?.close(); });
  beforeEach(async () => { await clearSyntheticBudget(db); });

  test('one permanent claim authorizes counting once, binds proof, and reserves no generation money', async () => {
    const x = await fixture(db); const preflight = await claim(db, x); assert.ok(preflight);
    assert.deepEqual(Object.keys(preflight).sort(), ['dispatch_not_after', 'preflight_nonce']);
    assert.match(preflight.preflight_nonce, /^[a-f0-9-]{36}$/);
    assert.ok(Date.parse(preflight.dispatch_not_after) <= Date.parse(x.args.p_deadline));
    const marker = (await db.query('SELECT * FROM employer_delivery.inline_attempts WHERE application_id=$1', [x.f.app])).rows[0];
    assert.equal(marker.review_preflight_nonce, preflight.preflight_nonce);
    assert.equal(marker.review_request_sha256, x.args.p_request_sha256);
    assert.equal(marker.review_snapshot_sha256, x.args.p_snapshot_sha256);
    assert.equal(marker.review_config_id, configId); assert.equal(marker.review_applicant_user_id, x.f.applicant);
    assert.equal(await balance(db), 0); assert.deepEqual(await counts(db), {attempts: 1, reservations: 0});
    assert.equal(await claim(db, x), null);
    assert.equal(await claim(db, x, {p_request_sha256: 'e'.repeat(64)}), null);
    const old = await legacyInline(db);
    assert.equal(await beginLegacy(db, {args: {...old.args, p_application_id: x.f.app, p_applicant_user_id: x.f.applicant}}), null);
    assert.equal(await balance(db), 0);
  });

  test('pre-count eligibility, disabled/unsafe config, global and daily exhaustion reject without claiming', async () => {
    const x = await fixture(db);
    await prefill(db, cap); assert.equal(await claim(db, x), null);
    await prefill(db, cap - maxReserve + 1); assert.equal(await claim(db, x), null);
    await prefill(db, 0);
    for (const [id, patch] of Object.entries({
      disabledClaim: {enabled: false}, wrongModelClaim: {model: 'gpt-6-luna'}, unverifiedClaim: {verified: false},
      cheapClaim: {inputRate: 1}, dailyClaim: {daily: maxReserve - 1}, perAppClaim: {perApplication: maxReserve - 1},
    })) {
      await installSol(db, {id, ...patch}); assert.equal(await claim(db, x, {p_config_id: id}), null);
    }
    assert.equal(await claim(db, x, {p_applicant_user_id: uuid()}), null);
    assert.equal(await claim(db, x, {p_request_sha256: 'invalid'}), null);
    await db.query("UPDATE public.job_listings SET status='closed' WHERE id=$1", [x.f.job]);
    assert.equal(await claim(db, x), null);
    assert.deepEqual(await counts(db), {attempts: 0, reservations: 0}); assert.equal(await balance(db), 0);
  });

  test('begin requires exact unexpired nonce and source/config/request proof before any generation debit', async () => {
    const x = await fixture(db); assert.equal(await rawBegin(db, x, {p_preflight_nonce: uuid()}), null);
    assert.deepEqual(await counts(db), {attempts: 0, reservations: 0});
    const preflight = await claim(db, x); assert.ok(preflight);
    await installSol(db, {id: 'different-proof-config'});
    const exact = {p_preflight_nonce: preflight.preflight_nonce};
    for (const patch of [{p_preflight_nonce: null}, {p_preflight_nonce: uuid()},
      {p_snapshot_sha256: 'c'.repeat(64)}, {p_request_sha256: 'd'.repeat(64)},
      {p_config_id: 'different-proof-config'}, {p_applicant_user_id: uuid()}, {p_model: 'gpt-6-luna'}]) {
      assert.equal(await rawBegin(db, x, {...exact, ...patch}), null);
    }
    await db.query('UPDATE employer_delivery.budget_configuration SET enabled=false WHERE id=$1', [configId]);
    assert.equal(await rawBegin(db, x, exact), null);
    await db.query('UPDATE employer_delivery.budget_configuration SET enabled=true WHERE id=$1', [configId]);
    await db.query("UPDATE employer_delivery.inline_attempts SET dispatch_not_after=clock_timestamp()-interval '1 second' WHERE application_id=$1", [x.f.app]);
    assert.equal(await rawBegin(db, x, exact), null);
    assert.equal(await claim(db, x), null); assert.equal(await balance(db), 0);
    assert.deepEqual(await counts(db), {attempts: 1, reservations: 0});
  });

  test('failed or unknown counting burns the attempt permanently without refund or retry authority', async () => {
    const x = await fixture(db); assert.ok(await claim(db, x));
    // Counting HTTP is intentionally never made in SQL tests. Its failure leaves
    // the committed claim exactly as-is: no generation money existed to refund.
    await db.query("UPDATE employer_delivery.inline_attempts SET dispatch_not_after=clock_timestamp()-interval '1 second' WHERE application_id=$1", [x.f.app]);
    assert.equal(await claim(db, x), null);
    await db.query('DELETE FROM public.applications WHERE id=$1', [x.f.app]);
    assert.equal(await balance(db), 0); assert.deepEqual(await counts(db), {attempts: 1, reservations: 0});
  });

  test('grant binds exact counted input, model, config, full-request hash, output and cutoff', async () => {
    const x = await fixture(db); const r = await begin(db, x); assert.ok(r);
    assert.equal(r.reserved_microusd, maxReserve); assert.equal(r.input_token_ceiling, 16000);
    assert.equal(r.model, 'gpt-6.1-sol'); assert.equal(r.config_id, configId);
    assert.equal(r.request_sha256, x.args.p_request_sha256); assert.equal(r.token_count_source, 'responses_input_tokens');
    assert.equal(r.reasoning_effort, 'low'); assert.equal(r.service_tier, 'default');
    assert.equal(r.max_output_tokens, 2048);
    assert.equal(r.input_microusd_per_million, 5_500_000); assert.equal(r.output_microusd_per_million, 16_500_000);
    assert.ok(Date.parse(r.dispatch_not_after) <= Date.parse(x.args.p_deadline));
    const record = await row(db, r);
    assert.equal(record.review_request_sha256, x.args.p_request_sha256);
    assert.equal(record.review_token_count_source, 'responses_input_tokens');
    assert.equal(record.outbox_id, null); assert.equal(record.inline_application_id, x.f.app);
    assert.equal(record.state, 'dispatched'); assert.ok(record.dispatched_at);
    assert.equal(await balance(db), maxReserve);
    assert.deepEqual(await counts(db), {attempts: 1, reservations: 1});
  });

  test('counted input reduces only input reserve; output stays at the frozen 2048 bound', async () => {
    const x = await fixture(db, {input: 1}); const r = await begin(db, x);
    assert.equal(r.reserved_microusd, 33798); assert.equal(r.input_token_ceiling, 1); assert.equal(r.max_output_tokens, 2048);
    assert.equal(await settle(db, r, {p_input_tokens: 2, p_output_tokens: 0}), false);
    assert.equal(await balance(db), 33798);
  });

  test('all old/new models, configurations and employers spend the same unchanged global month', async () => {
    await prefill(db, cap - maxReserve - 400);
    const sol = await fixture(db), luna = await legacyInline(db), outbox = await legacyOutbox(db);
    assert.ok(await begin(db, sol)); assert.ok(await beginLegacy(db, luna)); assert.ok(await beginOutbox(db, outbox));
    assert.equal(await balance(db), cap);
    const later = await fixture(db, {config: 'sol-new-config'});
    assert.equal(await begin(db, later), null); assert.equal(await balance(db), cap);
    assert.deepEqual(await counts(db), {attempts: 2, reservations: 3});
    assert.equal((await db.query('SELECT count(DISTINCT scope)::int AS n FROM employer_delivery.budget_months')).rows[0].n, 1);
  });

  test('insufficient global, daily or per-application headroom never consumes an attempt', async () => {
    const x = await fixture(db); await prefill(db, cap - maxReserve + 1);
    assert.equal(await begin(db, x), null);
    await prefill(db, 0);
    await installSol(db, {id: 'daily-tight', daily: maxReserve - 1});
    await installSol(db, {id: 'application-tight', perApplication: maxReserve - 1});
    assert.equal(await begin(db, x, {p_config_id: 'daily-tight'}), null);
    assert.equal(await begin(db, x, {p_config_id: 'application-tight'}), null);
    assert.deepEqual(await counts(db), {attempts: 0, reservations: 0}); assert.equal(await balance(db), 0);
    assert.ok(await begin(db, x), 'Failed admission did not consume the allowed application attempt');
  });

  test('wrong model/config/count/hash/output never consumes generation money or another attempt', async () => {
    const x = await fixture(db); await installBudgetConfig(db, {id: 'luna-only'});
    const invalid = [
      {p_model: 'gpt-6-luna'}, {p_model: null}, {p_config_id: 'missing'}, {p_config_id: 'luna-only'},
      {p_input_token_count: 0}, {p_input_token_count: -1}, {p_input_token_count: 16001}, {p_input_token_count: null},
      {p_request_sha256: ''}, {p_request_sha256: 'z'.repeat(64)}, {p_request_sha256: null},
      {p_max_output_tokens: 2047}, {p_max_output_tokens: 2049}, {p_max_output_tokens: null},
    ];
    for (const patch of invalid) assert.equal(await begin(db, x, patch), null, JSON.stringify(patch));
    for (const [name, override] of Object.entries({
      disabled: {enabled: false}, unverified: {verified: false}, provider: {provider: 'other'},
      model: {model: 'gpt-6-luna'}, cheapInput: {inputRate: 5_499_999}, cheapOutput: {outputRate: 16_499_999},
      fullContext: {maxInput: 1_050_000}, shortOutput: {maxOutput: 1024},
    })) {
      await installSol(db, {id: name, ...override}); assert.equal(await begin(db, x, {p_config_id: name}), null, name);
    }
    assert.deepEqual(await counts(db), {attempts: 1, reservations: 0}); assert.equal(await balance(db), 0);
    assert.ok(await begin(db, x));
  });

  test('ownership, active job and legacy-path checks remain authoritative', async () => {
    const x = await fixture(db);
    assert.equal(await begin(db, x, {p_applicant_user_id: uuid()}), null);
    assert.equal(await begin(db, x, {p_application_id: uuid()}), null);
    await db.query("UPDATE public.job_listings SET status='closed' WHERE id=$1", [x.f.job]);
    assert.equal(await begin(db, x), null);
    await db.query("UPDATE public.job_listings SET status='active' WHERE id=$1", [x.f.job]);
    await db.query('UPDATE public.users SET is_banned=true WHERE id=$1', [x.f.applicant]);
    assert.equal(await begin(db, x), null);
    const nonLegacy = await fixture(db, {enabled: true}); assert.equal(await begin(db, nonLegacy), null);
    assert.deepEqual(await counts(db), {attempts: 0, reservations: 0}); assert.equal(await balance(db), 0);
  });

  test('old Luna and Sol can never consume a second attempt for the same application', async () => {
    const x = await fixture(db); const r = await begin(db, x); assert.ok(r);
    assert.equal(await begin(db, x, {p_request_sha256: 'd'.repeat(64), p_request_key: 'new-request'}), null);
    const old = await legacyInline(db);
    assert.equal(await beginLegacy(db, {args: {...old.args, p_application_id: x.f.app, p_applicant_user_id: x.f.applicant}}), null);
    const oldR = await beginLegacy(db, old); assert.ok(oldR);
    assert.equal(await begin(db, x, {p_application_id: old.f.app, p_applicant_user_id: old.f.applicant}), null);
    const queued = await legacyOutbox(db); const queuedR = await beginOutbox(db, queued); assert.ok(queuedR);
    const y = await fixture(db);
    await db.query('UPDATE employer_delivery.budget_reservations SET application_id=$2 WHERE id=$1', [queuedR.reservation_id, y.f.app]);
    assert.equal(await begin(db, y), null);
    assert.equal(await balance(db), maxReserve + 400); assert.deepEqual(await counts(db), {attempts: 2, reservations: 3});
  });

  test('unknown usage, failed transport, expired authorization and deleted application retain full hold', async () => {
    const x = await fixture(db); const r = await begin(db, x); const record = await row(db, r);
    assert.equal(await call(db, 'employer_screening_release_budget', {p_reservation_id: r.reservation_id, p_lease: record.lease}), false);
    assert.equal(await call(db, 'employer_screening_start_request', {p_reservation_id: r.reservation_id, p_lease: record.lease}), false);
    assert.equal(await settle(db, r, {p_input_tokens: null, p_output_tokens: null, p_evidence_id: null}), false);
    await db.query("UPDATE employer_delivery.inline_attempts SET dispatch_not_after=clock_timestamp()-interval '1 second' WHERE application_id=$1", [x.f.app]);
    await db.query('UPDATE employer_delivery.budget_configuration SET enabled=false WHERE id=$1', [configId]);
    await db.query('DELETE FROM public.applications WHERE id=$1', [x.f.app]);
    assert.equal((await row(db, r)).state, 'uncertain'); assert.equal(await balance(db), maxReserve);
    assert.equal(await begin(db, x), null); assert.deepEqual(await counts(db), {attempts: 1, reservations: 1});
  });

  test('shared settle uses immutable Sol bounds, rejects overuse and refunds exactly once', async () => {
    const x = await fixture(db); const r = await begin(db, x);
    for (const patch of [{p_input_tokens: 16001}, {p_output_tokens: 2049}, {p_input_tokens: -1}, {p_evidence_id: ''}]) {
      assert.equal(await settle(db, r, patch), false); assert.equal(await balance(db), maxReserve);
    }
    assert.equal(await settle(db, r), true); assert.equal(await balance(db), halfReserve);
    assert.equal(await settle(db, r), true); assert.equal(await balance(db), halfReserve);
    assert.equal(await settle(db, r, {p_input_tokens: 1}), false); assert.equal(await balance(db), halfReserve);
    assert.equal(await begin(db, x), null);
  });

  test('Sol and Luna share receipt uniqueness and failed duplicate receipts roll back refunds', async () => {
    const old = await legacyInline(db), oldR = await beginLegacy(db, old);
    const x = await fixture(db), r = await begin(db, x);
    assert.equal(await settle(db, oldR, {p_input_tokens: 80, p_output_tokens: 20, p_evidence_id: 'shared-receipt'}), true);
    await assert.rejects(settle(db, r, {p_evidence_id: 'shared-receipt'}), /duplicate key/);
    assert.equal(await balance(db), maxReserve + 120);
    assert.equal(Number((await row(db, r)).charged_microusd), maxReserve);
  });

  test('late receipt refunds only original month/day and never refreshes current allowance', async () => {
    const x = await fixture(db), r = await begin(db, x); const current = await month(db);
    const previous = (await db.query("SELECT ($1::date-interval '1 month')::date::text AS m", [current])).rows[0].m;
    await db.query('UPDATE employer_delivery.budget_months SET month=$2 WHERE month=$1', [current, previous]);
    await db.query('UPDATE employer_delivery.budget_days SET day=$2 WHERE config_id=$1', [configId, previous]);
    await db.query('UPDATE employer_delivery.budget_reservations SET month=$2,day=$2 WHERE id=$1', [r.reservation_id, previous]);
    await prefill(db, cap); assert.equal(await settle(db, r), true);
    assert.equal(await balance(db, previous), halfReserve); assert.equal(await balance(db, current), cap);
    const next = await fixture(db); assert.equal(await begin(db, next), null);
  });

  test('non-finite/expired deadlines and invalid hashes fail without an attempt', async () => {
    const x = await fixture(db);
    for (const patch of [{p_deadline: 'infinity'}, {p_deadline: '-infinity'}, {p_deadline: null},
      {p_deadline: new Date(Date.now() - 1000).toISOString()}, {p_snapshot_sha256: 'bad'}]) {
      assert.equal(await begin(db, x, patch), null);
    }
    assert.deepEqual(await counts(db), {attempts: 0, reservations: 0}); assert.equal(await balance(db), 0);
  });

  test('service-only RPC and private proof data are not exposed to applicant clients', async () => {
    const x = await fixture(db);
    for (const role of ['anon', 'authenticated']) {
      await actAs(db, x.f.applicant, role, role);
      await assert.rejects(begin(db, x), /permission denied/);
      await assert.rejects(db.query('SELECT review_request_sha256 FROM employer_delivery.budget_reservations'), /permission denied/);
    }
    await actAs(db, '', 'service_role', 'service_role');
    await assert.rejects(db.query("UPDATE employer_delivery.budget_reservations SET review_request_sha256=$1", ['c'.repeat(64)]), /permission denied/);
    const r = await begin(db, x); assert.ok(r); assert.equal(await settle(db, r), true);
  });

  test('upgrade is additive: old function definitions and history stay identical; new config stays disabled', async () => {
    const c = new PGlite();
    try {
      await setupOutboxDb(c); await c.exec(inlineSql);
      const old = await legacyInline(c); const r = await beginLegacy(c, old);
      await c.query('UPDATE employer_delivery.budget_configuration SET enabled=false');
      const previous = await row(c, r);
      const functionQuery = "SELECT proname,prosrc,proconfig,proacl FROM pg_proc WHERE proname LIKE 'employer_screening_%' ORDER BY proname";
      const funcs = (await c.query(functionQuery)).rows;
      const configs = (await c.query('SELECT * FROM employer_delivery.budget_configuration ORDER BY id')).rows;
      await c.exec(sql);
      const current = await row(c, r); delete current.review_request_sha256; delete current.review_token_count_source;
      assert.deepEqual(current, previous); assert.equal(await balance(c), 200);
      assert.deepEqual((await c.query(functionQuery)).rows.filter(f => !['employer_screening_begin_inline_v2', 'employer_screening_claim_review_v2'].includes(f.proname)), funcs);
      assert.deepEqual((await c.query('SELECT * FROM employer_delivery.budget_configuration WHERE id<>$1 ORDER BY id', [configId])).rows, configs);
      const config = (await c.query('SELECT * FROM employer_delivery.budget_configuration WHERE id=$1', [configId])).rows[0];
      assert.equal(config.enabled, false); assert.equal(config.model, 'gpt-6.1-sol');
      assert.equal(Number(config.per_application_microusd), maxReserve); assert.equal(Number(config.daily_microusd), cap);
      await c.query('UPDATE employer_delivery.budget_configuration SET enabled=true WHERE id=$1', [old.args.p_config_id]);
      const another = await legacyInline(c); assert.ok(await beginLegacy(c, another));
    } finally { await c.close(); }
  });

  test('upgrade refuses enabled configs atomically and does not partially seed or alter history', async () => {
    const c = new PGlite();
    try {
      await setupOutboxDb(c); await c.exec(inlineSql); await installBudgetConfig(c);
      await assert.rejects(c.exec(sql), /DISABLE_PAID_CONFIGURATIONS_BEFORE_SOL_V2_INSTALL/); await c.exec('ROLLBACK');
      assert.equal((await c.query("SELECT to_regprocedure($1) AS f", [signature])).rows[0].f, null);
      assert.equal((await c.query('SELECT count(*)::int AS n FROM employer_delivery.budget_configuration WHERE id=$1', [configId])).rows[0].n, 0);
      assert.equal((await c.query("SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='employer_delivery.budget_reservations'::regclass AND attname='review_request_sha256'")).rows[0].n, 0);
    } finally { await c.close(); }
  });

  // Controlled clock substitution is local to this disposable database and is
  // restored exactly. No production test-clock input or mutable clock is added.
  async function withClock(stamps, run) {
    const originals = [];
    for (const name of [signature, claimSignature]) originals.push((await db.query('SELECT pg_get_functiondef($1::regprocedure) AS definition', [name])).rows[0].definition);
    await db.exec(`CREATE SCHEMA sol_budget_test;
      CREATE TABLE sol_budget_test.position(n integer NOT NULL); INSERT INTO sol_budget_test.position VALUES(0);
      CREATE TABLE sol_budget_test.stamps(n integer PRIMARY KEY, stamp timestamptz NOT NULL);
      CREATE FUNCTION sol_budget_test.clock() RETURNS timestamptz LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
      DECLARE position integer; result timestamptz;
      BEGIN
        UPDATE sol_budget_test.position SET n=n+1 RETURNING n INTO position;
        SELECT stamp INTO STRICT result FROM sol_budget_test.stamps WHERE n=position;
        RETURN result;
      END $$;`);
    try {
      for (const [index, stamp] of stamps.entries()) await db.query('INSERT INTO sol_budget_test.stamps VALUES($1,$2)', [index + 1, stamp]);
      for (const original of originals) await db.exec(original.replace(/(?:pg_catalog\.)?clock_timestamp\(\)/g, 'sol_budget_test.clock()'));
      await run();
    } finally { for (const original of originals) await db.exec(original); await db.exec('DROP SCHEMA sol_budget_test CASCADE'); }
  }

  test('post-lock clock rejects both day/month rollover and request-deadline expiry without attempt', async () => {
    for (const day of ['2030-01-15', '2030-01-31']) {
      const x = await fixture(db), initial = `${day}T23:59:59.500Z`, next = new Date(Date.parse(initial) + 1000).toISOString();
      await withClock([initial, next], async () => {
        assert.equal(await begin(db, x, {p_deadline: new Date(Date.parse(next) + 10000).toISOString()}), null);
      });
    }
    const x = await fixture(db);
    await withClock(['2030-01-15T12:00:00Z', '2030-01-15T12:00:01Z'], async () => {
      assert.equal(await begin(db, x, {p_deadline: '2030-01-15T12:00:00.500Z'}), null);
    });
    assert.deepEqual(await counts(db), {attempts: 0, reservations: 0});
    assert.equal(Number((await db.query('SELECT coalesce(sum(reserved_microusd),0) AS n FROM employer_delivery.budget_months')).rows[0].n), 0);
  });

  test('cutoff after claim INSERT atomically rolls back unissued claim and never debits ledgers', async () => {
    const x = await fixture(db);
    await withClock(['2030-01-31T23:59:59.500Z', '2030-01-31T23:59:59.600Z', '2030-02-01T00:00:00.001Z'], async () => {
      assert.equal(await begin(db, x, {p_deadline: '2030-02-01T00:00:10Z'}), null);
    });
    assert.deepEqual(await counts(db), {attempts: 0, reservations: 0});
    assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.budget_months')).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.budget_days')).rows[0].n, 0);
  });

  test('generation cutoff rollback preserves the previously committed permanent count claim', async () => {
    const x = await fixture(db);
    await withClock(['2030-01-31T23:59:59.100Z', '2030-01-31T23:59:59.200Z', '2030-01-31T23:59:59.300Z',
      '2030-01-31T23:59:59.400Z', '2030-01-31T23:59:59.500Z', '2030-02-01T00:00:00.001Z'], async () => {
      assert.equal(await begin(db, x, {p_deadline: '2030-02-01T00:00:10Z'}), null);
    });
    assert.deepEqual(await counts(db), {attempts: 1, reservations: 0});
    assert.equal(await balance(db, '2030-01-01'), 0); assert.equal(await balance(db, '2030-02-01'), 0);
    assert.equal(await claim(db, x), null);
  });

  test('successful last-millisecond grant expires at UTC midnight and never borrows next month', async () => {
    const x = await fixture(db); await db.exec("SET TIME ZONE 'Pacific/Kiritimati'");
    try {
      await withClock(['2030-01-31T23:59:59.500Z', '2030-01-31T23:59:59.600Z', '2030-01-31T23:59:59.650Z',
        '2030-01-31T23:59:59.700Z', '2030-01-31T23:59:59.750Z', '2030-01-31T23:59:59.800Z'], async () => {
        const r = await begin(db, x, {p_deadline: '2030-02-01T00:00:10Z'}); assert.ok(r);
        assert.equal(Date.parse(r.dispatch_not_after), Date.parse('2030-02-01T00:00:00Z'));
        assert.equal((await row(db, r)).month, '2030-01-01'); assert.equal((await row(db, r)).day, '2030-01-31');
        assert.equal(await balance(db, '2030-01-01'), maxReserve); assert.equal(await balance(db, '2030-02-01'), 0);
      });
    } finally { await db.exec("SET TIME ZONE 'UTC'"); }
  });

  test('one-second lock bound is installed and does not leak session settings', async () => {
    const config = (await db.query('SELECT proconfig FROM pg_proc WHERE oid=$1::regprocedure', [signature])).rows[0].proconfig;
    assert.ok(config.includes('lock_timeout=1s')); const prior = (await db.query('SHOW lock_timeout')).rows[0].lock_timeout;
    const x = await fixture(db); const r = await begin(db, x); assert.ok(r);
    assert.equal((await db.query('SHOW lock_timeout')).rows[0].lock_timeout, prior);
  });
});

// Genuine overlapping PostgreSQL sessions, opt-in only. This suite never starts
// or installs a daemon and refuses remote/nonempty databases. CI can supply its
// existing disposable PostgreSQL service; a skipped suite is NOT a concurrency pass.
const connectionString = process.env.SOL_REVIEW_BUDGET_TEST_DATABASE_URL;
const pgEnabled = !!connectionString;
if (pgEnabled) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.pathname !== '/joblink_sol_review_budget_test' || url.search || url.hash) {
    throw new Error('Use an existing empty localhost joblink_sol_review_budget_test database; URL overrides are forbidden.');
  }
}
describe('Sol/Luna independent PostgreSQL transaction locks', {skip: !pgEnabled}, () => {
  let db, ready = false;
  const clients = [];
  async function connect() {
    const c = new Client({connectionString}); await c.connect(); clients.push(c);
    c.exec = statement => c.query(statement); await actAs(c); await c.query("SET statement_timeout='10000ms'"); return c;
  }
  before(async () => {
    if (!pgEnabled) return;
    db = await connect();
    const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname<>'information_schema'");
    if (tables.rows.length) throw new Error('Sol concurrency fixture must be empty; existing tables/data are never reset.');
    const roles = (await db.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')")).rows;
    const exec = db.exec;
    db.exec = statement => exec(statement.replace(/CREATE ROLE (anon|authenticated);/g,
      (_, role) => roles.some(r => r.rolname === role) ? '' : `CREATE ROLE ${role};`)
      .replace(/CREATE ROLE service_role BYPASSRLS;/g,
        roles.some(r => r.rolname === 'service_role') ? '' : 'CREATE ROLE service_role BYPASSRLS;'));
    await setupOutboxDb(db); db.exec = exec;
    await db.exec(inlineSql); await db.exec(sql); ready = true;
  });
  beforeEach(async () => { if (ready) await clearSyntheticBudget(db); });
  after(async () => { await Promise.all(clients.map(c => c.end())); });
  async function waitForLock(c) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const status = (await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [c.processID])).rows[0];
      if (status?.wait_event_type === 'Lock') return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Independent PostgreSQL contender did not demonstrably wait on a lock');
  }
  async function race(first, action, second, competitor) {
    await first.query('BEGIN'); let pending;
    try {
      const winner = await action();
      pending = competitor().then(value => ({value}), error => ({error}));
      await waitForLock(second); await first.query('COMMIT');
      return [winner, await pending];
    } finally { await first.query('ROLLBACK'); if (pending) await pending; }
  }

  test('simultaneous pre-count claims for the same application return exactly one nonce', async () => {
    const x = await fixture(db), first = await connect(), second = await connect();
    const [winner, loser] = await race(first, () => claim(first, x), second, () => claim(second, x));
    assert.ok(winner); assert.equal(loser.error, undefined); assert.equal(loser.value, null);
    assert.deepEqual(await counts(db), {attempts: 1, reservations: 0}); assert.equal(await balance(db), 0);
  });

  for (const firstPath of ['claim', 'luna']) {
    test(`pre-count claim excludes old Luna generation on same application with ${firstPath} first`, async () => {
      const sol = await fixture(db), luna = await legacyInline(db);
      luna.args.p_application_id = sol.f.app; luna.args.p_applicant_user_id = sol.f.applicant;
      const first = await connect(), second = await connect();
      const [winner, loser] = firstPath === 'claim'
        ? await race(first, () => claim(first, sol), second, () => beginLegacy(second, luna))
        : await race(first, () => beginLegacy(first, luna), second, () => claim(second, sol));
      assert.ok(winner); assert.equal(loser.error, undefined); assert.equal(loser.value, null);
      assert.equal(await balance(db), firstPath === 'claim' ? 0 : 200);
      assert.deepEqual(await counts(db), {attempts: 1, reservations: firstPath === 'claim' ? 0 : 1});
    });
  }

  test('two Sol applications and configurations cannot both spend the final global allowance', async () => {
    const a = await fixture(db), b = await fixture(db, {config: 'sol-second-config'});
    await prefill(db, cap - maxReserve); const first = await connect(), second = await connect();
    const [winner, loser] = await race(first, () => begin(first, a), second, () => begin(second, b));
    assert.ok(winner); assert.equal(loser.error, undefined); assert.equal(loser.value, null);
    assert.equal(await balance(db), cap); assert.deepEqual(await counts(db), {attempts: 1, reservations: 1});
  });

  for (const older of ['inline', 'outbox']) {
    for (const firstPath of ['sol', 'luna']) {
      test(`Sol and old Luna ${older} share the same final cap with ${firstPath} first`, async () => {
        const sol = await fixture(db), luna = older === 'inline' ? await legacyInline(db) : await legacyOutbox(db);
        const olderBegin = older === 'inline' ? beginLegacy : beginOutbox;
        await prefill(db, cap - (firstPath === 'sol' ? maxReserve : 200));
        const first = await connect(), second = await connect();
        const [winner, loser] = firstPath === 'sol'
          ? await race(first, () => begin(first, sol), second, () => olderBegin(second, luna))
          : await race(first, () => olderBegin(first, luna), second, () => begin(second, sol));
        assert.ok(winner); assert.equal(loser.error, undefined); assert.equal(loser.value, null);
        assert.equal(await balance(db), cap); assert.equal((await counts(db)).reservations, 1);
      });
    }
  }

  for (const firstPath of ['sol', 'luna']) {
    test(`same application cannot dispatch through both Sol and Luna with ${firstPath} first`, async () => {
      const sol = await fixture(db), luna = await legacyInline(db);
      luna.args.p_application_id = sol.f.app; luna.args.p_applicant_user_id = sol.f.applicant;
      const first = await connect(), second = await connect();
      const [winner, loser] = firstPath === 'sol'
        ? await race(first, () => begin(first, sol), second, () => beginLegacy(second, luna))
        : await race(first, () => beginLegacy(first, luna), second, () => begin(second, sol));
      assert.ok(winner); assert.equal(loser.error, undefined); assert.equal(loser.value, null);
      assert.equal(await balance(db), firstPath === 'sol' ? maxReserve : 200);
      assert.deepEqual(await counts(db), {attempts: 1, reservations: 1});
    });
  }

  test('overlapping bounded settlement frees only verified current-month usage for new Sol dispatch', async () => {
    const a = await fixture(db), prior = await begin(db, a), b = await fixture(db, {config: 'next-sol-config'});
    await prefill(db, cap - halfReserve); const first = await connect(), second = await connect();
    const [settled, next] = await race(first, () => settle(first, prior), second, () => begin(second, b));
    assert.equal(settled, true); assert.equal(next.error, undefined); assert.ok(next.value); assert.equal(await balance(db), cap);
    assert.equal(Number((await row(db, prior)).charged_microusd), halfReserve);
  });

  test('simultaneous late receipts refund once in their original month and leave current month full', async () => {
    const x = await fixture(db), prior = await begin(db, x), current = await month(db);
    const previous = (await db.query("SELECT ($1::date-interval '1 month')::date::text AS m", [current])).rows[0].m;
    await db.query('UPDATE employer_delivery.budget_months SET month=$2 WHERE month=$1', [current, previous]);
    await db.query('UPDATE employer_delivery.budget_days SET day=$2 WHERE config_id=$1', [configId, previous]);
    await db.query('UPDATE employer_delivery.budget_reservations SET month=$2,day=$2 WHERE id=$1', [prior.reservation_id, previous]);
    await prefill(db, cap); const first = await connect(), second = await connect();
    const [settled, duplicate] = await race(first, () => settle(first, prior), second, () => settle(second, prior));
    assert.equal(settled, true); assert.equal(duplicate.error, undefined); assert.equal(duplicate.value, true);
    assert.equal(await balance(db, previous), halfReserve); assert.equal(await balance(db, current), cap);
    const next = await fixture(db); assert.equal(await begin(db, next), null);
  });

  test('money-lock timeout leaves no debit or consumed attempt and releases earlier application lock', async () => {
    const x = await fixture(db); await prefill(db, 0);
    const holder = await connect(), contender = await connect(), observer = await connect();
    const setting = (await contender.query('SHOW lock_timeout')).rows[0].lock_timeout;
    await holder.query('BEGIN'); let pending;
    try {
      await holder.query('SELECT 1 FROM employer_delivery.budget_months WHERE scope=$1 AND month=$2 FOR UPDATE', [scope, await month(db)]);
      pending = begin(contender, x).then(value => ({value}), error => ({error}));
      await waitForLock(contender); const result = await pending;
      assert.equal(result.error?.code, '55P03');
      assert.equal((await contender.query('SHOW lock_timeout')).rows[0].lock_timeout, setting);
      await observer.query('SELECT 1 FROM public.applications WHERE id=$1 FOR UPDATE NOWAIT', [x.f.app]);
      assert.equal(await balance(db), 0); assert.deepEqual(await counts(db), {attempts: 0, reservations: 0});
    } finally { await holder.query('ROLLBACK'); if (pending) await pending; }
    assert.ok(await begin(db, x), 'The timed-out attempt remains eligible once the lock is free');
  });
});
