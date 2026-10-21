import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { setupOutboxDb,actAs,outboxFixture,outboxStore,outboxRow,call,installBudgetConfig,reserveArgs,uuid,documentQualityFixture } from './helpers/employer-outbox-db.mjs';
import {captureEmail} from '../src/lib/employer-screening/index.ts';

// Real multi-session PostgreSQL only, never simulate these lock assertions with PGlite.
// Existing CI postgres service may supply a fresh local DB; this test never starts services.
const connectionString=process.env.OUTBOX_TEST_DATABASE_URL;
const enabled=!!connectionString;
if(enabled){const u=new URL(connectionString);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.pathname!=='/joblink_outbox_test')throw new Error('Use a dedicated empty localhost database named joblink_outbox_test only.');}
let db;const clients=[];
async function connect(){const c=new Client({connectionString});await c.connect();c.exec=sql=>c.query(sql);clients.push(c);await actAs(c);return c;}
before(async()=>{if(!enabled)return;db=await connect();const {rows}=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");if(rows.length)throw new Error('Outbox concurrency database must be empty; existing data is never reset.');
 // CI claims tests may already have created cluster-global fixture roles.
 const {rows:roles}=await db.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')");
 // setupClaimsDb creates roles unconditionally. Reuse cluster fixture roles without dropping them.
 const exec=db.exec;db.exec=sql=>exec(sql.replace(/CREATE ROLE (anon|authenticated);/g,(_,r)=>roles.some(x=>x.rolname===r)?'':`CREATE ROLE ${r};`).replace(/CREATE ROLE service_role BYPASSRLS;/g,roles.some(x=>x.rolname==='service_role')?'':'CREATE ROLE service_role BYPASSRLS;'));
 await setupOutboxDb(db);db.exec=exec;
});
after(async()=>{await Promise.all(clients.map(c=>c.end()));});
const run=(name,fn)=>test(name,{skip:!enabled},fn);
async function waitForLock(c){const until=Date.now()+5000;while(Date.now()<until){const {rows:[r]}=await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[c.processID]);if(r?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,15));}throw new Error('Competitor did not demonstrably overlap on a database lock');}
async function claim(c,f){const r=await outboxStore(c).claim(0);assert.equal(r?.item.id,f.id);return r;}
async function prepare(c,f){const r=await claim(c,f);assert.equal(await outboxStore(c).freeze(f.id,r.lease,f.email),true);return r;}
run('SKIP LOCKED claims a different application while the first lease transaction is open',async()=>{
 const a=await outboxFixture(db),b=await outboxFixture(db,{clear:false}),first=await connect(),second=await connect();
 await first.query('BEGIN');const ca=await claim(first,a);await second.query("SET statement_timeout='1000ms'");const cb=await claim(second,b);assert.notEqual(ca.lease,cb.lease);await first.query('COMMIT');
});
run('locked expired send does not bulk-lock or block unrelated claims',async()=>{
 const bad=await outboxFixture(db),good=await outboxFixture(db,{clear:false}),first=await connect(),second=await connect();const c=await prepare(db,bad);await outboxStore(db).startSend(bad.id,c.lease,bad.email.payloadSha256,0);
 await db.query("UPDATE employer_delivery.outbox SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[bad.id]);
 await first.query('BEGIN');await first.query('SELECT id FROM employer_delivery.outbox WHERE id=$1 FOR UPDATE',[bad.id]);
 await second.query("SET statement_timeout='1000ms'");await claim(second,good);await first.query('COMMIT');assert.equal(await outboxStore(db).watchdog(),1);
});
run('concurrent freeze is immutable CAS, loser cannot replace winning bytes',async()=>{
 const f=await outboxFixture(db),c=await claim(db,f),first=await connect(),second=await connect();const {payloadSha256,...content}=f.email;void payloadSha256;
 await first.query('BEGIN');assert.equal(await outboxStore(first).freeze(f.id,c.lease,f.email),true);
 const competing=outboxStore(second).freeze(f.id,c.lease,captureEmail({...content,html:'different'}));await waitForLock(second);await first.query('COMMIT');assert.equal(await competing,false);
 assert.equal((await outboxRow(db,f)).payload_sha256,f.email.payloadSha256);
});
run('concurrent materials finalization atomically pins scoring and independent quality without a later patch',async()=>{
 const f=await outboxFixture(db,{register:false,quality:true}),first=await connect(),second=await connect();
 const args={p_application_id:f.app,p_applicant_user_id:f.applicant,p_snapshot_json:f.snapshot.json,p_snapshot_sha256:f.snapshot.sha256,
  p_quality_json:f.quality.json,p_quality_sha256:f.quality.sha256};
 const different=documentQualityFixture('a'.repeat(64),'Experience\nRole: Office assistant');
 await first.query('BEGIN');assert.equal(await call(first,'employer_screening_register_materials',args),true);
 const competing=call(second,'employer_screening_register_materials',{...args,p_quality_json:different.json,p_quality_sha256:different.sha256});
 await waitForLock(second);await first.query('COMMIT');assert.equal(await competing,false);
 const r=await outboxRow(db,f);assert.equal(r.materials_finalized,true);assert.equal(r.snapshot_json,f.snapshot.json);assert.equal(r.quality_json,f.quality.json);
 assert.equal(r.snapshot_sha256,f.snapshot.sha256);assert.equal(r.quality_sha256,f.quality.sha256);
});
run('only one concurrent start_send wins and increments a provider attempt',async()=>{
 const f=await outboxFixture(db),c=await prepare(db,f),first=await connect(),second=await connect();await first.query('BEGIN');assert.equal(await outboxStore(first).startSend(f.id,c.lease,f.email.payloadSha256,0),true);
 const competing=outboxStore(second).startSend(f.id,c.lease,f.email.payloadSha256,0);await waitForLock(second);await first.query('COMMIT');assert.equal(await competing,false);assert.equal((await outboxRow(db,f)).attempts,1);
});
run('lease expiry is rechecked after waiting on row lock',async()=>{
 const f=await outboxFixture(db),c=await prepare(db,f),first=await connect(),second=await connect();
 await db.query("UPDATE employer_delivery.outbox SET lease_expires_at=clock_timestamp()+interval '400 milliseconds' WHERE id=$1",[f.id]);
 await first.query('BEGIN');await first.query('SELECT id FROM employer_delivery.outbox WHERE id=$1 FOR UPDATE',[f.id]);
 const competing=outboxStore(second).startSend(f.id,c.lease,f.email.payloadSha256,0);await waitForLock(second);await first.query('SELECT pg_sleep(0.5)');await first.query('COMMIT');assert.equal(await competing,false);assert.equal((await outboxRow(db,f)).attempts,0);
});
run('deletion overlapping dispatch retains a redacted uncertain tombstone',async()=>{
 const f=await outboxFixture(db,{quality:true}),c=await prepare(db,f),first=await connect(),second=await connect();await first.query('BEGIN');await outboxStore(first).startSend(f.id,c.lease,f.email.payloadSha256,0);
 const deleting=second.query('DELETE FROM public.applications WHERE id=$1',[f.app]);await waitForLock(second);await first.query('COMMIT');await deleting;const r=await outboxRow(db,f);
 assert.equal(r.state,'uncertain');assert.equal(r.payload_sha256,f.email.payloadSha256);assert.equal(r.baseline_json,null);assert.equal(r.frozen_email_json,null);
 assert.equal(r.quality_json,null);assert.equal(r.quality_sha256,null);
 assert.equal(await outboxStore(db).finish(f.id,c.lease,{kind:'accepted',providerId:'late'},null),false);
});
run('verified provider receipt racing worker finish remains accepted with one receipt',async()=>{
 const f=await outboxFixture(db),c=await prepare(db,f),first=await connect(),second=await connect();await outboxStore(db).startSend(f.id,c.lease,f.email.payloadSha256,0);
 await first.query('BEGIN');assert.equal(await outboxStore(first).recordReceipt(f.app,f.email.payloadSha256,'provider-synthetic','event-synthetic'),true);
 const finishing=outboxStore(second).finish(f.id,c.lease,{kind:'uncertain'},null);await waitForLock(second);await first.query('COMMIT');assert.equal(await finishing,false);assert.equal((await outboxRow(db,f)).state,'accepted');
});
run('concurrent budget reservations serialize the shared daily cap before provider dispatch',async()=>{
 const cfg=await installBudgetConfig(db,{id:'concurrent-daily',daily:200}),a=await outboxFixture(db),b=await outboxFixture(db,{clear:false}),ca=await claim(db,a),cb=await claim(db,b),first=await connect(),second=await connect();
 await first.query('BEGIN');const reserved=await call(first,'employer_screening_reserve_budget',reserveArgs(a,ca.lease,cfg));assert.ok(reserved);
 const competing=call(second,'employer_screening_reserve_budget',reserveArgs(b,cb.lease,cfg));await waitForLock(second);await first.query('COMMIT');assert.equal(await competing,null);
 const {rows:[day]}=await db.query('SELECT reserved_microusd FROM employer_delivery.budget_days WHERE config_id=$1',[cfg]);assert.equal(Number(day.reserved_microusd),200);
});
run('concurrent rubric approval has one immutable version winner',async()=>{
 const f=await outboxFixture(db),first=await connect(),second=await connect(),args={p_job_id:f.job,p_owner_user_id:f.employer,p_expected_version:f.approved.versionId,p_criteria:JSON.stringify(f.approved.criteria)};
 await first.query('BEGIN');const winner=await call(first,'employer_screening_approve_rubric',args);
 const competing=call(second,'employer_screening_approve_rubric',args).then(x=>x,e=>e);await waitForLock(second);await first.query('COMMIT');assert.equal((await competing).code,'40001');
 assert.equal((await call(db,'employer_screening_get_rubric',{p_job_id:f.job})).versionId,winner.versionId);
});
run('same UUID submission cannot create more than one baseline/delivery across concurrent retries',async()=>{
 const f=await outboxFixture(db),first=await connect(),second=await connect(),job=uuid(),app=uuid();
 await db.query("INSERT INTO public.job_listings(id,company_id,title,description,status) VALUES($1,$2,'Second','Synthetic','active')",[job,f.company]);
 const input={...f.input,p_application_id:app,p_job_id:job,p_attachment:null,p_resume_version_id:null,p_resume_sha256:null};
 await first.query('BEGIN');const a=await call(first,'employer_screening_apply',input);
 const competing=call(second,'employer_screening_apply',input);await waitForLock(second);await first.query('COMMIT');const b=await competing;
 assert.equal(a.baseline_sha256,b.baseline_sha256);assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.outbox WHERE application_id=$1',[app])).rows[0].n,1);
});
