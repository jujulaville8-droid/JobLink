import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {setupClaimsDb} from './helpers/claims-db.mjs';
import {setupOutboxDb,outboxSql,outboxFixture,call,outboxStore,installBudgetConfig,reserveArgs,actAs,uuid,outboxRow} from './helpers/employer-outbox-db.mjs';
import {processNext,composeBaseline} from '../src/lib/employer-screening/index.ts';
const scope='joblink-screening-api',cap=5_000_000;
const upgrade=readFileSync('docs/employer-screening/drafts/employer-monthly-budget-upgrade.unapplied.sql','utf8');
const v4Budget=readFileSync('tests/fixtures/employer-budget-v4.sql','utf8');
let db;
before(async()=>{db=new PGlite();await setupOutboxDb(db);});
after(async()=>{await db?.close();});
beforeEach(async()=>{await actAs(db);await db.exec('DELETE FROM employer_delivery.budget_reservations;DELETE FROM employer_delivery.budget_days;DELETE FROM employer_delivery.budget_months;DELETE FROM employer_delivery.budget_configuration;');});
async function monthOf(c=db){return (await c.query("SELECT date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date::text AS month")).rows[0].month;}
async function balance(c=db,month=undefined){const m=month??await monthOf(c);return Number((await c.query('SELECT reserved_microusd FROM employer_delivery.budget_months WHERE scope=$1 AND month=$2',[scope,m])).rows[0]?.reserved_microusd??0);}
async function seedMonth(amount,c=db,month=undefined){await c.query('INSERT INTO employer_delivery.budget_months(month,reserved_microusd) VALUES($1,$2) ON CONFLICT(scope,month) DO UPDATE SET reserved_microusd=excluded.reserved_microusd',[month??await monthOf(c),amount]);}
async function reserve({config='monthly-v1',daily=1000,fixture={},c=db}={}){const cfg=await installBudgetConfig(c,{id:config,daily}),f=await outboxFixture(c,fixture),claim=await outboxStore(c).claim(0);assert.equal(claim?.item.id,f.id);const args=reserveArgs(f,claim.lease,cfg),r=await call(c,'employer_screening_reserve_budget',args);return {f,claim,args,r};}
const start=(x,c=db)=>call(c,'employer_screening_start_request',{p_reservation_id:x.r.reservation_id,p_lease:x.claim.lease});
const release=(x,c=db)=>call(c,'employer_screening_release_budget',{p_reservation_id:x.r.reservation_id,p_lease:x.claim.lease});
const settle=(x,patch={},c=db)=>call(c,'employer_screening_settle_budget',{p_reservation_id:x.r.reservation_id,p_input_tokens:80,p_output_tokens:20,p_evidence_id:`usage-${x.r.reservation_id}`,...patch});
async function previousMonth(x,{dispatched=false,c=db}={}){
  // Synthetic history fixture, not a production clock override or public argument.
  const m=await monthOf(c),old=(await c.query("SELECT ($1::date-interval '1 month')::date::text AS month",[m])).rows[0].month;
  await c.query('UPDATE employer_delivery.budget_months SET month=$2 WHERE month=$1',[m,old]);
  await c.query('UPDATE employer_delivery.budget_days SET day=$2 WHERE config_id=$1',[x.args.p_config_id,old]);
  await c.query("UPDATE employer_delivery.budget_reservations SET month=$2,day=$2,dispatched_at=CASE WHEN $3 THEN $2::date::timestamptz ELSE dispatched_at END WHERE id=$1",[x.r.reservation_id,old,dispatched]);return {m,old};
}
test('one immutable five-dollar scope covers different configurations, rates and employer account IDs',async()=>{
 await seedMonth(cap-200);const a=await reserve();assert.equal(a.r.reserved_microusd,200);assert.equal(await balance(),cap);
 const b=await reserve({config:'new-rate-version'});assert.notEqual(a.f.employer,b.f.employer);assert.equal(b.r,null);
 await db.query("INSERT INTO employer_delivery.budget_configuration SELECT 'third-rate-version',true,true,provider,model,2,3,100,50,200,1000 FROM employer_delivery.budget_configuration WHERE id='monthly-v1'");
 const c=await reserve({config:'third-rate-version'});assert.equal(c.r,null);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.budget_months')).rows[0].n,1);
 await assert.rejects(db.query('INSERT INTO employer_delivery.budget_months(scope,month) VALUES($1,$2)',['another-account',await monthOf()]),/check constraint/);
 await assert.rejects(db.query('UPDATE employer_delivery.budget_months SET reserved_microusd=$1',[cap+1]),/check constraint/);
});
test('full model context is never downsized to squeeze under monthly remaining allowance',async()=>{
 await seedMonth(cap-199);const x=await reserve();assert.equal(x.r,null);assert.equal(await balance(),cap-199);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_delivery.budget_reservations')).rows[0].n,0);
});
test('month allowance never overrides the existing per-application or per-configuration daily limits',async()=>{
 assert.equal((await reserve({config:'daily-tight',daily:199})).r,null);assert.equal(await balance(),0);
 await db.query("INSERT INTO employer_delivery.budget_configuration SELECT 'app-tight',true,true,provider,model,input_microusd_per_million,output_microusd_per_million,max_input_tokens,max_output_tokens,199,1000 FROM employer_delivery.budget_configuration WHERE id='daily-tight'");
 assert.equal((await reserve({config:'app-tight'})).r,null);assert.equal(await balance(),0);
});
test('exactly five dollars is admissible but a single full-context reserve above five dollars is denied',async()=>{
 await installBudgetConfig(db);
 for(const [id,inputRate,expected] of [['exact-five',25000000000,true],['above-five',25000000001,false]]){
  await db.query(`INSERT INTO employer_delivery.budget_configuration SELECT $1,true,true,provider,model,$2,50000000000,100,50,10000000,10000000 FROM employer_delivery.budget_configuration WHERE id='synthetic-exact-v1'`,[id,inputRate]);
  const x=await reserve({config:id});assert.equal(x.r!==null,expected);
  if(expected){assert.equal(x.r.reserved_microusd,cap);assert.equal(await balance(),cap);assert.equal(await release(x),true);}
  assert.equal(await balance(),0);
 }
});
test('reserved retry is idempotent and distinct application reservations sum persistently',async()=>{
 const a=await reserve();assert.deepEqual(await call(db,'employer_screening_reserve_budget',a.args),a.r);assert.equal(await balance(),200);
 const b=await reserve({config:'v2'});assert.ok(b.r);assert.equal(await balance(),400);
 assert.equal(Number((await db.query('SELECT sum(charged_microusd) AS n FROM employer_delivery.budget_reservations')).rows[0].n),400);
});
test('unknown, invalid, late and failed settlements hold full month charge until bounded evidence arrives',async()=>{
 const x=await reserve();assert.equal(await start(x),true);
 for(const patch of [{p_input_tokens:null,p_output_tokens:null,p_evidence_id:null},{p_input_tokens:101},{p_output_tokens:-1},{p_evidence_id:''}]){assert.equal(await settle(x,patch),false);assert.equal(await balance(),200);}
 assert.equal(await release(x),false);assert.equal(await settle(x),true);assert.equal(await balance(),120);
 assert.equal(await settle(x),true);assert.equal(await balance(),120);
 assert.equal(await settle(x,{p_input_tokens:1}),false);assert.equal(await balance(),120);
 assert.equal(await release(x),false);
});
test('settlement cannot manufacture a refund for usage cost above the reservation',async()=>{
 const x=await reserve();assert.equal(await start(x),true);
 // Simulate corrupt historical rate data as DB owner. No service role can do this.
 await db.query('UPDATE employer_delivery.budget_reservations SET input_microusd_per_million=999999999999 WHERE id=$1',[x.r.reservation_id]);
 assert.equal(await settle(x),false);assert.equal(await balance(),200);
 assert.equal((await db.query('SELECT state FROM employer_delivery.budget_reservations WHERE id=$1',[x.r.reservation_id])).rows[0].state,'uncertain');
});
test('duplicate provider usage evidence rolls back both ledgers instead of double-refunding',async()=>{
 const a=await reserve();await start(a);await settle(a,{p_evidence_id:'same-provider-receipt'});
 const b=await reserve({config:'v2'});await start(b);assert.equal(await balance(),320);
 await assert.rejects(settle(b,{p_evidence_id:'same-provider-receipt'}),/duplicate key/);assert.equal(await balance(),320);
 assert.equal(Number((await db.query('SELECT charged_microusd FROM employer_delivery.budget_reservations WHERE id=$1',[b.r.reservation_id])).rows[0].charged_microusd),200);
});
test('known-unused fenced release refunds once, prevents later start or re-reservation, and rejects wrong leases',async()=>{
 const x=await reserve();assert.equal(await call(db,'employer_screening_release_budget',{p_reservation_id:x.r.reservation_id,p_lease:uuid()}),false);assert.equal(await balance(),200);
 assert.equal(await release(x),true);assert.equal(await balance(),0);assert.equal(await release(x),true);assert.equal(await balance(),0);
 assert.equal(await start(x),false);assert.equal(await call(db,'employer_screening_reserve_budget',x.args),null);assert.equal(await settle(x),false);
});
test('cross-month start rejects old reservation; known-unused release only changes old month',async()=>{
 const x=await reserve();const {m,old}=await previousMonth(x);await seedMonth(cap);
 assert.equal(await start(x),false);assert.equal(await balance(db,old),200);assert.equal(await balance(db,m),cap);
 assert.equal(await release(x),true);assert.equal(await balance(db,old),0);assert.equal(await balance(db,m),cap);
});
test('late unknown-to-settled refund is attributed to original month, never new allowance',async()=>{
 const x=await reserve();await start(x);await settle(x,{p_input_tokens:null});const {m,old}=await previousMonth(x,{dispatched:true});
 const y=await reserve({config:'next-month'});assert.ok(y.r);assert.equal(await balance(db,m),200);
 assert.equal(await settle(x),true);assert.equal(await balance(db,old),120);assert.equal(await balance(db,m),200);
});
test('month assignment uses UTC rather than SQL session timezone',async()=>{
 await db.exec("SET TIME ZONE 'Pacific/Kiritimati'");try{const x=await reserve();const r=(await db.query('SELECT month::text,day::text FROM employer_delivery.budget_reservations WHERE id=$1',[x.r.reservation_id])).rows[0];assert.equal(r.month,await monthOf());assert.equal(await start(x),true);}finally{await db.exec("SET TIME ZONE 'UTC'");}
});
test('at cap, optional screening makes no provider attempt and original forwarding baseline still sends once',async()=>{
 await seedMonth(cap);const cfg=await installBudgetConfig(db),f=await outboxFixture(db);let providerCalls=0,sends=0,reserveCalls=0;
 const processorFactory=(_item,lease)=>async()=>{reserveCalls++;assert.ok(lease);const r=await call(db,'employer_screening_reserve_budget',reserveArgs(f,lease,cfg));if(r===null)throw new Error('Monthly allowance unavailable');providerCalls++;throw new Error('Must not call provider');};
 assert.equal(await processNext(outboxStore(db),async()=>{throw new Error('unused');},composeBaseline,async email=>{sends++;assert.equal(email.to,f.email.to);assert.deepEqual(email.attachments,f.email.attachments);return {kind:'accepted',providerId:'synthetic-only'};},Date.now,{processorFactory}),true);
 assert.equal(reserveCalls,1);assert.equal(providerCalls,0);assert.equal(sends,1);assert.equal((await outboxRow(db,f)).state,'accepted');assert.equal(await balance(),cap);
});
test('private monthly ledger and release RPC cannot be accessed by browser roles or directly by service role',async()=>{
 const x=await reserve();for(const role of ['anon','authenticated']){await actAs(db,x.f.applicant,role,role);await assert.rejects(db.query('SELECT * FROM employer_delivery.budget_months'),/permission denied/);await assert.rejects(release(x),/permission denied/);}await actAs(db,'','service_role','service_role');await assert.rejects(db.query('UPDATE employer_delivery.budget_months SET reserved_microusd=0'),/permission denied/);assert.equal(await release(x),true);await actAs(db);
});
async function v4Database(){const c=new PGlite();await setupClaimsDb(c);const a=outboxSql.indexOf('-- Exact approved model/rate/token configuration'),b=outboxSql.indexOf('-- Pre-register the exact private object',a);await c.exec(outboxSql.slice(0,a)+v4Budget+outboxSql.slice(b));return c;}
test('V4 upgrade atomically backfills all histories and installs identical global budget RPCs',async()=>{
 const c=await v4Database();try{const a=await reserve({c}),b=await reserve({c,config:'v4-second-rate'});await start(b,c);await settle(b,{p_input_tokens:null},c);
 await c.exec('UPDATE employer_delivery.budget_configuration SET enabled=false');await c.exec(upgrade);assert.equal(await balance(c),400);
 assert.equal((await c.query('SELECT count(DISTINCT budget_scope)::int AS n FROM employer_delivery.budget_reservations')).rows[0].n,1);
 const names=['reserve_budget','start_request','settle_budget','release_budget'];for(const name of names){const sql='SELECT prosrc FROM pg_proc WHERE proname=$1',args=[`employer_screening_${name}`];assert.equal((await c.query(sql,args)).rows[0].prosrc,(await db.query(sql,args)).rows[0].prosrc);}
 await c.exec('UPDATE employer_delivery.budget_configuration SET enabled=true');await seedMonth(cap,c);const blocked=await reserve({c,config:'v4-third-rate'});assert.equal(blocked.r,null);
 assert.equal(await release(a,c),true);assert.equal(await balance(c),cap-200);
 // Legacy insert shape has no month, so it fails rather than bypassing accounting.
 await assert.rejects(c.query(`INSERT INTO employer_delivery.budget_reservations(outbox_id,account_id,application_id,config_id,day,lease,snapshot_sha256,request_key,model,input_microusd_per_million,output_microusd_per_million,input_token_ceiling,max_output_tokens,reserved_microusd,charged_microusd) SELECT outbox_id,account_id,$2,config_id,day,lease,snapshot_sha256,'old-function',model,input_microusd_per_million,output_microusd_per_million,input_token_ceiling,max_output_tokens,reserved_microusd,charged_microusd FROM employer_delivery.budget_reservations WHERE id=$1`,[a.r.reservation_id,uuid()]),/null value in column "month"/);
 }finally{await c.close();}
});
test('V4 upgrade refuses active paid configurations without making partial schema changes',async()=>{
 const c=await v4Database();try{await reserve({c});await assert.rejects(c.exec(upgrade),/DISABLE_PAID_CONFIGURATIONS_BEFORE_UPGRADE/);await c.exec('ROLLBACK');assert.equal((await c.query("SELECT to_regclass('employer_delivery.budget_months') AS t")).rows[0].t,null);}finally{await c.close();}
});
test('V4 over-cap history is not truncated or reset to fit the new limit',async()=>{
 const c=await v4Database();try{const x=await reserve({c});await c.query('UPDATE employer_delivery.budget_reservations SET charged_microusd=$1,reserved_microusd=$1 WHERE id=$2',[cap+1,x.r.reservation_id]);await c.exec('UPDATE employer_delivery.budget_configuration SET enabled=false');await assert.rejects(c.exec(upgrade),/check constraint/);await c.exec('ROLLBACK');assert.equal((await c.query("SELECT to_regclass('employer_delivery.budget_months') AS t")).rows[0].t,null);assert.equal(Number((await c.query('SELECT charged_microusd FROM employer_delivery.budget_reservations')).rows[0].charged_microusd),cap+1);}finally{await c.close();}
});
