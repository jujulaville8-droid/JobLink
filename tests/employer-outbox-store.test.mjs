import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { setupOutboxDb,actAs,user,uuid,outboxFixture as fixtureFor,outboxRow,call,outboxStore,installBudgetConfig,reserveArgs,documentQualityFixture } from './helpers/employer-outbox-db.mjs';
import { captureEmail,captureSnapshot,readBaseline,readDocumentQuality,processNext,composeBaseline } from '../src/lib/employer-screening/index.ts';
let db,store;
before(async()=>{db=new PGlite();await setupOutboxDb(db);store=outboxStore(db);});
after(async()=>{await db?.close();});
const fixture=options=>fixtureFor(db,options),row=f=>outboxRow(db,f);
async function claimed(f){const c=await store.claim(0);assert.equal(c?.item.id,f.id);return c;}
async function sending(f){const c=await claimed(f);assert.equal(await store.freeze(f.id,c.lease,f.email),true);assert.equal(await store.startSend(f.id,c.lease,f.email.payloadSha256,0),true);return c;}
async function expire(f){await db.query("UPDATE employer_delivery.outbox SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[f.id]);}
const frozenJson=value=>{const json=typeof value==='string'?value:JSON.stringify(value);return {json,sha256:createHash('sha256').update(json).digest('hex')};};
const materialsArgs=(f,quality=f.quality)=>({p_application_id:f.app,p_applicant_user_id:f.applicant,
 p_snapshot_json:f.snapshot?.json??null,p_snapshot_sha256:f.snapshot?.sha256??null,
 p_quality_json:quality?.json??null,p_quality_sha256:quality?.sha256??null});
test('DB defaults OFF, atomically captures independent baseline and path once',async()=>{
 const f=await fixture({enabled:false});const r=await row(f),b=readBaseline(f.baseline);
 assert.equal(r.state,'inactive');assert.equal(f.result.employer_delivery_path,'legacy');assert.equal(r.account_id,f.employer);assert.equal(r.applicant_id,f.applicant);
 assert.equal(r.snapshot_json,null);assert.equal(b.from,'JobLink <notifications@joblinkantigua.com>');assert.equal(b.resumeVersionId,null);assert.deepEqual(b.attachments,[]);
 assert.equal(await store.claim(Date.now()),null);
 await db.exec('UPDATE employer_delivery.configuration SET enabled=true');assert.equal((await row(f)).delivery_path,'legacy');
 await assert.rejects(db.query("UPDATE public.applications SET employer_delivery_path='screening' WHERE id=$1",[f.app]),/DELIVERY_PATH_IMMUTABLE/);
 await assert.rejects(db.query("UPDATE employer_delivery.outbox SET baseline_json='{}' WHERE id=$1",[f.id]),/BASELINE_IMMUTABLE/);
});
test('direct insert stays legacy even when DB enabled; runtime cannot force path',async()=>{
 const f=await fixture();const other=uuid(),app=uuid();
 await db.query("INSERT INTO public.job_listings(id,company_id,title,description,status) VALUES($1,$2,'Second','Synthetic','active')",[other,f.company]);
 await db.query("INSERT INTO public.applications(id,job_id,seeker_id,employer_delivery_path) VALUES($1,$2,$3,'screening')",[app,other,f.profile]);
 assert.equal((await db.query('SELECT employer_delivery_path FROM public.applications WHERE id=$1',[app])).rows[0].employer_delivery_path,'legacy');
});
test('failure in baseline capture rolls back application insert',async()=>{
 const f=await fixture({enabled:false}),app=uuid(),job=uuid();
 await db.query("INSERT INTO public.job_listings(id,company_id,title,description,status) VALUES($1,$2,'Second','Synthetic','active')",[job,f.company]);
 await db.exec("CREATE FUNCTION employer_delivery.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER test_fail BEFORE INSERT ON employer_delivery.outbox FOR EACH ROW EXECUTE FUNCTION employer_delivery.test_fail();");
 try{await assert.rejects(call(db,'employer_screening_apply',{...f.input,p_application_id:app,p_job_id:job,p_attachment:null,p_resume_sha256:null,p_resume_version_id:null}),/synthetic failure/);
 assert.equal((await db.query('SELECT id FROM public.applications WHERE id=$1',[app])).rows.length,0);}
 finally{await db.exec('DROP TRIGGER test_fail ON employer_delivery.outbox;DROP FUNCTION employer_delivery.test_fail();');}
});
test('same application UUID retry returns original baseline and screening path after rollback',async()=>{
 const f=await fixture();await db.exec('UPDATE employer_delivery.configuration SET enabled=false');
 const repeat=await call(db,'employer_screening_apply',{...f.input,p_cover_letter_text:'changed'});
 assert.equal(repeat.employer_delivery_path,'screening');assert.equal(repeat.baseline_sha256,f.baseline.sha256);
 assert.equal((await row(f)).delivery_path,'screening');assert.equal((await claimed(f)).item.id,f.id);
});
test('anon/authenticated cannot read private tables or invoke trusted service RPCs',async()=>{
 const f=await fixture();for(const role of ['anon','authenticated']){await actAs(db,f.applicant,role,role);
 await assert.rejects(db.query('SELECT * FROM employer_delivery.outbox'),/permission denied/);
 for(const [name,args] of [['employer_outbox_claim',{}],['employer_screening_configuration',{}],['employer_screening_apply',f.input],
 ['employer_screening_register_materials',materialsArgs(f,documentQualityFixture())],
 ['employer_screening_approve_rubric',{p_job_id:f.job,p_owner_user_id:f.employer,p_expected_version:null,p_criteria:'[]'}],
 ['employer_screening_reserve_budget',reserveArgs(f,uuid())]])await assert.rejects(call(db,name,args),/permission denied/);}
 await actAs(db);
});
test('service role uses RPCs but cannot directly read/provision private rows',async()=>{
 const f=await fixture();await actAs(db,'','service_role','service_role');
 await assert.rejects(db.query('SELECT * FROM employer_delivery.configuration'),/permission denied/);assert.equal((await claimed(f)).item.id,f.id);await actAs(db);
});
test('no CV is valid and corrupt optional screening does not block baseline forwarding',async()=>{
 for(const attachment of [false,true]){const f=await fixture({attachment});
 if(attachment)await db.query("UPDATE employer_delivery.outbox SET snapshot_json='invalid json',snapshot_sha256=$2 WHERE id=$1",[f.id,'a'.repeat(64)]);
 let sends=0;assert.equal(await processNext(store,async()=>{throw new Error('must not process');},composeBaseline,async email=>{sends++;assert.equal(email.attachments.length,attachment?1:0);return {kind:'accepted',providerId:'synthetic'};}),true);
 assert.equal(sends,1);assert.equal((await row(f)).state,'accepted');}
});
test('claim skips poison rows in same call and does not duplicate live leases',async()=>{
 const bad=await fixture(),good=await fixture({clear:false});await db.query("UPDATE public.users SET is_banned=true WHERE id=$1",[bad.employer]);
 const [a,b]=await Promise.all([store.claim(0),store.claim(0)]);assert.equal([a,b].filter(Boolean).length,1);assert.equal((a??b).item.id,good.id);assert.equal((await row(bad)).state,'blocked');
});
test('claim respects database due time and reclaim fences all stale transitions',async()=>{
 const f=await fixture();await db.query("UPDATE employer_delivery.outbox SET next_attempt_at=clock_timestamp()+interval '1 hour' WHERE id=$1",[f.id]);assert.equal(await store.claim(Number.MAX_SAFE_INTEGER),null);
 await db.query("UPDATE employer_delivery.outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[f.id]);
 const old=await claimed(f);await expire(f);const fresh=await claimed(f);assert.notEqual(old.lease,fresh.lease);
 assert.equal(await store.freeze(f.id,old.lease,f.email),false);assert.equal(await store.startSend(f.id,old.lease,f.email.payloadSha256,0),false);
 assert.equal(await store.finish(f.id,old.lease,{kind:'accepted',providerId:'stale'},null),false);assert.equal(await store.freeze(f.id,fresh.lease,f.email),true);
});
test('freeze is immutable CAS bound to exact baseline routing and attachment',async()=>{
 const f=await fixture(),c=await claimed(f),{payloadSha256,...content}=f.email;
 for(const change of [{to:'wrong@example.test'},{replyTo:'wrong@example.test'},{from:'notifications@joblinkantigua.com'},
 {attachments:[{...content.attachments[0],storagePath:'other/capture.pdf'}]}])assert.equal(await store.freeze(f.id,c.lease,captureEmail({...content,...change})),false);
 assert.equal(await store.freeze(f.id,c.lease,f.email),true);assert.equal(await store.freeze(f.id,c.lease,f.email),true);
 assert.equal(await store.freeze(f.id,c.lease,captureEmail({...content,html:'replacement'})),false);assert.equal((await row(f)).payload_sha256,payloadSha256);
});
test('first send and frozen bytes survive retry, only four attempts in original 23 hours',async()=>{
 const f=await fixture(),c=await sending(f),first=(await row(f)).first_send_at;
 assert.equal(await store.finish(f.id,c.lease,{kind:'not_sent'},Date.now()+60000),true);assert.equal(await store.claim(0),null);
 await db.query("UPDATE employer_delivery.outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[f.id]);
 const retry=await claimed(f);assert.equal(retry.item.email.payloadSha256,f.email.payloadSha256);assert.equal(await store.startSend(f.id,retry.lease,f.email.payloadSha256,Number.MAX_SAFE_INTEGER),true);
 assert.deepEqual((await row(f)).first_send_at,first);assert.equal((await row(f)).attempts,2);
 await db.query('UPDATE employer_delivery.outbox SET attempts=4 WHERE id=$1',[f.id]);await store.finish(f.id,retry.lease,{kind:'not_sent'},Date.now()+60000);assert.equal((await row(f)).state,'blocked');
});
test('changed owner, recipient, or employer ban blocks; applicant email change never reroutes ReplyTo',async()=>{
 for(const kind of ['owner','recipient','ban','reply']){const f=await fixture(),c=await claimed(f);await store.freeze(f.id,c.lease,f.email);
 if(kind==='owner')await db.query('UPDATE public.companies SET user_id=$2 WHERE id=$1',[f.company,await user(db)]);
 if(kind==='recipient'){await db.exec('GRANT SELECT,UPDATE ON public.companies TO service_role');await actAs(db,'','service_role','service_role');await db.query("UPDATE public.companies SET contact_email='changed@example.test' WHERE id=$1",[f.company]);await actAs(db);}
 if(kind==='ban')await db.query('UPDATE public.users SET is_banned=true WHERE id=$1',[f.employer]);
 if(kind==='reply')await db.query("UPDATE public.users SET email='new-'+id::text||'@example.test' WHERE id=$1".replace("'new-'+","'new-'||"),[f.applicant]);
 assert.equal(await store.startSend(f.id,c.lease,f.email.payloadSha256,0),kind==='reply');}
});
test('external recipient baseline omits owner-only dashboard link',async()=>{const f=await fixture({external:true});assert.equal(readBaseline(f.baseline).reviewPath,null);});
test('horizon and attempt cap block claim and start without new attempts',async()=>{
 for(const reason of ['horizon','cap'])for(const afterClaim of [false,true]){const f=await fixture(),c=afterClaim?await claimed(f):null;if(c)await store.freeze(f.id,c.lease,f.email);
 await db.query("UPDATE employer_delivery.outbox SET attempts=$2,first_send_at=clock_timestamp()-$3::interval WHERE id=$1",[f.id,reason==='cap'?4:1,reason==='horizon'?'23 hours':'1 minute']);
 if(c)assert.equal(await store.startSend(f.id,c.lease,f.email.payloadSha256,0),false);else assert.equal(await store.claim(0),null);assert.equal((await row(f)).state,'blocked');}
});
test('watchdog quarantines expired send, stale finish fails, only definitive evidence reconciles',async()=>{
 const f=await fixture(),c=await sending(f);await expire(f);assert.equal(await store.finish(f.id,c.lease,{kind:'accepted',providerId:'late'},null),false);
 assert.equal(await store.watchdog(),1);assert.equal((await row(f)).state,'uncertain');assert.equal(await store.claim(0),null);
 assert.equal(await call(db,'employer_outbox_reconcile',{p_id:f.id,p_digest:f.email.payloadSha256,p_kind:'timeout',p_provider_id:null,p_evidence_id:'not-evidence'}),false);
 const proof={kind:'accepted',providerId:'receipt',evidenceId:'receipt-synthetic'};assert.equal(await store.reconcile(f.id,f.email.payloadSha256,proof),true);assert.equal(await store.reconcile(f.id,f.email.payloadSha256,proof),true);assert.equal((await row(f)).state,'accepted');
});
test('unknown/conflicting outcomes quarantine; malformed acceptance is never safe retry',async()=>{
 for(const kind of ['uncertain','concurrent_conflict','accepted','rejected','payload_conflict','rate_limited']){const f=await fixture(),c=await sending(f);await store.finish(f.id,c.lease,{kind,retryAfterMs:30000,providerId:''},Date.now()+24*60*60*1000);
 assert.equal((await row(f)).state,['uncertain','concurrent_conflict','accepted'].includes(kind)?'uncertain':'blocked');assert.equal(await store.claim(0),null);}
});
test('application/job/company/user deletion redacts all payload and preserves terminal minimal tombstone',async()=>{
 for(const target of ['application','job','company','applicant','employer']){const f=await fixture({quality:true}),c=await sending(f);const [table,id]=({application:['public.applications',f.app],job:['public.job_listings',f.job],company:['public.companies',f.company],applicant:['auth.users',f.applicant],employer:['auth.users',f.employer]})[target];
 await db.query(`DELETE FROM ${table} WHERE id=$1`,[id]);const r=await row(f);assert.equal(r.state,'uncertain');assert.equal(r.payload_sha256,f.email.payloadSha256);
 for(const key of ['baseline_json','snapshot_json','quality_json','quality_sha256','frozen_email_json','attachment','expected_to','expected_reply_to'])assert.equal(r[key],null,key);
 await assert.rejects(db.query('UPDATE employer_delivery.outbox SET quality_json=$2,quality_sha256=$3 WHERE id=$1',[f.id,f.quality.json,f.quality.sha256]),/TOMBSTONE_IMMUTABLE/);
 assert.equal(await store.freeze(f.id,c.lease,f.email),false);assert.equal(await store.startSend(f.id,c.lease,f.email.payloadSha256,0),false);assert.equal(await store.finish(f.id,c.lease,{kind:'accepted',providerId:'late'},null),false);
 assert.equal(await store.reconcile(f.id,f.email.payloadSha256,{kind:'accepted',providerId:'late-confirmed',evidenceId:`deletion-${target}`}),true);assert.equal((await row(f)).state,'accepted');}
});
test('pre-send deletion cannot be recreated or retried, confirmed-unsent tombstone stays cancelled',async()=>{
 const f=await fixture(),c=await claimed(f);await db.query('DELETE FROM public.applications WHERE id=$1',[f.app]);assert.equal((await row(f)).state,'cancelled');assert.equal(await store.freeze(f.id,c.lease,f.email),false);assert.equal(await store.claim(0),null);
 const sent=await fixture(),sc=await sending(sent);await store.finish(sent.id,sc.lease,{kind:'uncertain'},null);await db.query('DELETE FROM public.applications WHERE id=$1',[sent.app]);
 await store.reconcile(sent.id,sent.email.payloadSha256,{kind:'not_sent',evidenceId:'synthetic-no-acceptance'});assert.equal((await row(sent)).state,'cancelled');
});
test('rubric is owner-bound versioned immutable CAS and selected at apply, not a client approved flag',async()=>{
 const f=await fixture();const criteria=[{id:'other',label:'Other skill',category:'skill',weight:100,verificationRequired:false}];
 await assert.rejects(call(db,'employer_screening_approve_rubric',{p_job_id:f.job,p_owner_user_id:f.applicant,p_expected_version:f.approved.versionId,p_criteria:JSON.stringify(criteria)}),/RUBRIC_NOT_AUTHORIZED/);
 await assert.rejects(call(db,'employer_screening_approve_rubric',{p_job_id:f.job,p_owner_user_id:f.employer,p_expected_version:null,p_criteria:JSON.stringify(criteria)}),/RUBRIC_VERSION_CONFLICT/);
 const next=await call(db,'employer_screening_approve_rubric',{p_job_id:f.job,p_owner_user_id:f.employer,p_expected_version:f.approved.versionId,p_criteria:JSON.stringify(criteria)});
 assert.notEqual(next.versionId,f.approved.versionId);assert.equal((await row(f)).rubric_version_id,f.approved.versionId);
 await assert.rejects(db.query("UPDATE employer_delivery.rubrics SET rubric_json='{}' WHERE version_id=$1",[f.approved.versionId]),/RUBRIC_IMMUTABLE/);
});
test('materials bind tenant, app, digest, capture and pinned rubric; optional failure leaves baseline',async()=>{
 const f=await fixture({register:false}),base={p_application_id:f.app,p_applicant_user_id:f.applicant,p_snapshot_json:f.snapshot.json,p_snapshot_sha256:f.snapshot.sha256};
 assert.equal(await call(db,'employer_screening_register_materials',{...base,p_applicant_user_id:f.employer}),false);
 assert.equal(await call(db,'employer_screening_register_materials',{...base,p_snapshot_sha256:'b'.repeat(64)}),false);
 const changed=captureSnapshot({...JSON.parse(f.snapshot.json),applicationId:uuid()});assert.equal(await call(db,'employer_screening_register_materials',{...base,p_snapshot_json:changed.json,p_snapshot_sha256:changed.sha256}),false);
 assert.equal(await call(db,'employer_screening_register_materials',base),true);assert.equal(await call(db,'employer_screening_register_materials',base),true);await claimed(f);assert.equal(await call(db,'employer_screening_register_materials',base),false);assert.equal((await row(f)).baseline_sha256,f.baseline.sha256);
});
test('independent quality is durable and claimable without an approved job rubric',async()=>{
 const f=await fixture({rubric:false,quality:true}),r=await row(f),c=await claimed(f);
 assert.equal(r.rubric_json,null);assert.equal(r.snapshot_json,null);assert.equal(r.materials_finalized,true);
 assert.equal(r.quality_json,f.quality.json);assert.equal(r.quality_sha256,f.quality.sha256);
 assert.equal(c.item.snapshot,undefined);assert.deepEqual(c.item.quality,f.quality);
 const quality=readDocumentQuality(c.item.quality,readBaseline(c.item.baseline).resumeSha256);
 assert.equal(quality.sourceSha256,f.descriptor.sha256);assert.equal(quality.kind,'resume_document_quality');
 assert.equal(quality.dimensions.length,4);assert.equal(quality.supportedPoints,100);
 // Reviewed literal task prefixes may be exact local evidence; role/company values remain excluded.
 assert.doesNotMatch(r.quality_json,/Office assistant|Example business/);
 assert.ok(quality.dimensions.some(d=>d.findings.some(f=>f.evidence.some(e=>e.excerpt==='Maintained records'))));
});
test('valid quality survives null, unapproved and corrupt optional scoring material',async()=>{
 for(const scenario of ['null','unapproved','invalid-json','wrong-digest','wrong-identity']){
  const f=await fixture({register:false,quality:true}),args=materialsArgs(f);
  if(scenario==='null'){args.p_snapshot_json=null;args.p_snapshot_sha256=null;}
  else if(scenario==='wrong-digest')args.p_snapshot_sha256='f'.repeat(64);
  else {const material=scenario==='invalid-json'?frozenJson('not json'):frozenJson({...JSON.parse(f.snapshot.json),
   ...(scenario==='unapproved'?{rubric:{...f.approved,approved:false}}:{applicationId:uuid()})});
   args.p_snapshot_json=material.json;args.p_snapshot_sha256=material.sha256;}
  assert.equal(await call(db,'employer_screening_register_materials',args),true,scenario);
  assert.equal(await call(db,'employer_screening_register_materials',args),true,`${scenario} idempotence`);
  const r=await row(f),c=await claimed(f);assert.equal(r.snapshot_json,null);assert.equal(r.quality_sha256,f.quality.sha256);
  assert.equal(c.item.snapshot,undefined);assert.deepEqual(c.item.quality,f.quality);assert.equal(r.baseline_sha256,f.baseline.sha256);
 }
});
test('SQL drops malformed, mismatched, oversized or attachmentless optional quality without blocking baseline',async()=>{
 const valid=documentQualityFixture(),parsed=JSON.parse(valid.json);
 const invalid=[{...valid,sha256:'f'.repeat(64)},frozenJson('not json'),frozenJson([]),
  frozenJson({...parsed,sourceSha256:'b'.repeat(64)}),frozenJson({...parsed,kind:'job_score'}),
  frozenJson({...parsed,status:'unavailable'}),frozenJson({...parsed,rubricVersion:'unapproved-version'}),
  frozenJson(valid.json+' '.repeat(40961)),{json:valid.json,sha256:null},{json:null,sha256:valid.sha256}];
 for(const quality of invalid){const f=await fixture({rubric:false,register:false});
  assert.equal(await call(db,'employer_screening_register_materials',materialsArgs(f,quality)),true);
  const r=await row(f);assert.equal(r.quality_json,null);assert.equal(r.quality_sha256,null);assert.equal(r.materials_finalized,true);
  const c=await claimed(f);assert.equal(c.item.quality,undefined);assert.deepEqual(c.item.baseline,f.baseline);
 }
 const noAttachment=await fixture({attachment:false,register:false});
 assert.equal(await call(db,'employer_screening_register_materials',materialsArgs(noAttachment,valid)),true);
 assert.equal((await row(noAttachment)).quality_json,null);assert.equal((await claimed(noAttachment)).item.quality,undefined);
 // Invalid quality must not discard a separately valid job-specific snapshot.
 const scored=await fixture({register:false});assert.equal(await call(db,'employer_screening_register_materials',materialsArgs(scored,invalid[0])),true);
 const c=await claimed(scored);assert.deepEqual(c.item.snapshot,scored.snapshot);assert.equal(c.item.quality,undefined);
});
test('quality finalization is one atomic CAS with scoring and rejects later patches or cross-applicant writes',async()=>{
 const f=await fixture({register:false,quality:true}),args=materialsArgs(f),replacement=documentQualityFixture('a'.repeat(64),'Experience\nRole: Office assistant');
 assert.equal(await call(db,'employer_screening_register_materials',{...args,p_applicant_user_id:f.employer}),false);
 assert.equal((await row(f)).materials_finalized,false);assert.equal((await row(f)).quality_json,null);
 assert.equal(await call(db,'employer_screening_register_materials',args),true);assert.equal(await call(db,'employer_screening_register_materials',args),true);
 assert.equal(await call(db,'employer_screening_register_materials',materialsArgs(f,replacement)),false);
 assert.equal(await call(db,'employer_screening_register_materials',{...args,p_snapshot_json:null,p_snapshot_sha256:null}),false);
 assert.equal(await call(db,'employer_screening_register_materials',materialsArgs(f,null)),false);
 const r=await row(f);assert.equal(r.snapshot_sha256,f.snapshot.sha256);assert.equal(r.quality_sha256,f.quality.sha256);
 const baselineOnly=await fixture({register:false,rubric:false});
 assert.equal(await call(db,'employer_screening_register_materials',materialsArgs(baselineOnly)),true);
 assert.equal(await call(db,'employer_screening_register_materials',materialsArgs(baselineOnly,documentQualityFixture())),false);
 assert.equal((await row(baselineOnly)).quality_json,null);
});
test('optional quality corruption drops only quality, not the trusted baseline or valid scoring',async()=>{
 const valid=documentQualityFixture(),report=JSON.parse(valid.json);
 for(const corrupt of [frozenJson('invalid JSON'),{...valid,sha256:'f'.repeat(64)},frozenJson({...report,dimensions:[]}),
  frozenJson({...report,sourceSha256:'b'.repeat(64)}),frozenJson({...report,rawText:'private document prose'})]){
  const f=await fixture({quality:true});
  // Synthetic persisted-data corruption remains isolated to the optional channel.
  await db.query('UPDATE employer_delivery.outbox SET quality_json=$2,quality_sha256=$3 WHERE id=$1',[f.id,corrupt.json,corrupt.sha256]);
  let sends=0;
  assert.equal(await processNext(store,async()=>[{criterionId:'skill',finding:'unknown',evidenceIds:[]}],(baseline,assessment,quality)=>{
   assert.equal(quality,undefined);assert.equal(assessment.status,'scored');return composeBaseline(baseline,assessment);
  },async email=>{sends++;assert.deepEqual(email.attachments,[f.descriptor]);return {kind:'accepted',providerId:'quality-corruption-baseline'};}),true);
  assert.equal(sends,1);assert.equal((await row(f)).state,'accepted');assert.equal((await row(f)).last_error_code,null);
 }
});
test('quality remains available when persisted scoring is corrupt or the scoring provider fails',async()=>{
 for(const failure of ['provider','snapshot']){const f=await fixture({quality:true});
  if(failure==='snapshot')await db.query("UPDATE employer_delivery.outbox SET snapshot_json='not json',snapshot_sha256=$2 WHERE id=$1",[f.id,'f'.repeat(64)]);
  let composed=0;assert.equal(await processNext(store,async()=>{throw new Error('optional scoring unavailable');},(baseline,assessment,quality)=>{
   composed++;assert.equal(assessment.status,'unavailable');assert.equal(quality?.sourceSha256,f.descriptor.sha256);
   assert.equal(quality?.supportedPoints,100);return composeBaseline(baseline,assessment,quality);
  },async()=>({kind:'accepted',providerId:'independent-quality'})),true);
  assert.equal(composed,1);assert.equal((await row(f)).state,'accepted');
 }
});
test('corrupted optional quality never recomposes a previously frozen email retry',async()=>{
 const f=await fixture({quality:true}),c=await sending(f);
 assert.equal(await store.finish(f.id,c.lease,{kind:'not_sent'},Date.now()+60000),true);
 await db.query("UPDATE employer_delivery.outbox SET quality_json='invalid JSON',quality_sha256=$2,next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[f.id,'f'.repeat(64)]);
 let sends=0;assert.equal(await processNext(store,async()=>{throw new Error('must not rescore');},()=>{throw new Error('must not recompose');},async email=>{
  sends++;assert.deepEqual(email,f.email);return {kind:'accepted',providerId:'byte-frozen-quality-retry'};
 }),true);assert.equal(sends,1);assert.equal((await row(f)).attempts,2);assert.equal((await row(f)).payload_sha256,f.email.payloadSha256);
});
test('quality RPC is service-only while private fields and operator metadata expose no report',async()=>{
 const f=await fixture({register:false,rubric:false,quality:true});
 await actAs(db,'','service_role','service_role');
 await assert.rejects(db.query('SELECT quality_json,quality_sha256 FROM employer_delivery.outbox'),/permission denied/);
 assert.equal(await call(db,'employer_screening_register_materials',materialsArgs(f)),true);
 const status=await call(db,'employer_outbox_status',{p_application_id:f.app});assert.doesNotMatch(JSON.stringify(status),/quality|sourceSha256|dimensions|points/i);
 assert.deepEqual((await claimed(f)).item.quality,f.quality);await actAs(db);
});
test('capture descriptor requires exact tenant/application/version path, no arbitrary storage reference',async()=>{
 const f=await fixture(),newId=uuid();await assert.rejects(call(db,'employer_screening_apply',{...f.input,p_application_id:newId}),/INVALID_CAPTURE/);
 assert.equal((await db.query('SELECT id FROM public.applications WHERE id=$1',[newId])).rows.length,0);
});
test('durable budget reserves full verified input context before dispatch, counts uncertainty at full cost',async()=>{
 const f=await fixture(),c=await claimed(f);await installBudgetConfig(db);
 const args=reserveArgs(f,c.lease),r=await call(db,'employer_screening_reserve_budget',args);assert.equal(r.reserved_microusd,200);assert.equal(r.input_token_ceiling,100);
 assert.deepEqual(await call(db,'employer_screening_reserve_budget',args),r);
 assert.equal(await call(db,'employer_screening_start_request',{p_reservation_id:r.reservation_id,p_lease:uuid()}),false);
 assert.equal(await call(db,'employer_screening_start_request',{p_reservation_id:r.reservation_id,p_lease:c.lease}),true);
 assert.equal(await call(db,'employer_screening_start_request',{p_reservation_id:r.reservation_id,p_lease:c.lease}),false);
 assert.equal(await call(db,'employer_screening_settle_budget',{p_reservation_id:r.reservation_id,p_input_tokens:null,p_output_tokens:null,p_evidence_id:null}),false);
 const {rows:[charge]}=await db.query('SELECT state,charged_microusd FROM employer_delivery.budget_reservations WHERE id=$1',[r.reservation_id]);assert.equal(charge.state,'uncertain');assert.equal(Number(charge.charged_microusd),200);
 const usage={p_reservation_id:r.reservation_id,p_input_tokens:80,p_output_tokens:20,p_evidence_id:'provider-usage'};assert.equal(await call(db,'employer_screening_settle_budget',usage),true);assert.equal(await call(db,'employer_screening_settle_budget',usage),true);
 assert.equal(Number((await db.query('SELECT charged_microusd FROM employer_delivery.budget_reservations WHERE id=$1',[r.reservation_id])).rows[0].charged_microusd),120);
});
test('budget refuses missing/unverified configuration, understated input, tenant/digest/lease, and daily cap',async()=>{
 const cfg=await installBudgetConfig(db,{id:'synthetic-small',daily:200}),unverified=await installBudgetConfig(db,{id:'unverified',verified:false});
 const f=await fixture(),c=await claimed(f),args=reserveArgs(f,c.lease,cfg);
 for(const patch of [{p_config_id:'missing'},{p_config_id:unverified},{p_input_token_ceiling:1},{p_snapshot_sha256:'f'.repeat(64)},{p_lease:uuid()}])assert.equal(await call(db,'employer_screening_reserve_budget',{...args,...patch}),null);
 assert.ok(await call(db,'employer_screening_reserve_budget',args));
 const second=await fixture(),sc=await claimed(second);assert.equal(await call(db,'employer_screening_reserve_budget',reserveArgs(second,sc.lease,cfg)),null);
});
test('stale/deleted/expired application cannot authorize a reserved provider request',async()=>{
 for(const reason of ['stale','deleted']){const f=await fixture(),c=await claimed(f),cfg=await installBudgetConfig(db,{id:`synthetic-${reason}`}),r=await call(db,'employer_screening_reserve_budget',reserveArgs(f,c.lease,cfg));
 if(reason==='stale')await expire(f);else await db.query('DELETE FROM public.applications WHERE id=$1',[f.app]);
 assert.equal(await call(db,'employer_screening_start_request',{p_reservation_id:r.reservation_id,p_lease:c.lease}),false);}
});
test('finalization releases no-CV work early; abandoned material capture waits only until absolute deadline',async()=>{
 const f=await fixture({attachment:false,register:false});assert.equal(await store.claim(0),null);
 assert.equal(await call(db,'employer_screening_register_materials',{p_application_id:f.app,p_applicant_user_id:f.applicant,p_snapshot_json:null,p_snapshot_sha256:null}),true);await claimed(f);
 const crash=await fixture({register:false});assert.equal(await store.claim(0),null);
 await db.query("UPDATE employer_delivery.outbox SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[crash.id]);const c=await claimed(crash);assert.equal(c.item.snapshot,undefined);assert.ok(c.item.baseline);
});
test('signed-provider receipt path binds app,digest,attempt and provider id; never approves unattempted work',async()=>{
 const f=await fixture();assert.equal(await store.recordReceipt(f.app,f.email.payloadSha256,'receipt','event-before'),false);const c=await sending(f);
 assert.equal(await store.recordReceipt(f.app,'f'.repeat(64),'receipt','event-wrong'),false);
 assert.equal(await store.recordReceipt(f.app,f.email.payloadSha256,'receipt','event-correct'),true);assert.equal(await store.recordReceipt(f.app,f.email.payloadSha256,'receipt','event-correct'),true);
 assert.equal(await store.recordReceipt(f.app,f.email.payloadSha256,'different','event-new'),false);assert.equal(await store.finish(f.id,c.lease,{kind:'uncertain'},null),false);assert.equal((await row(f)).state,'accepted');
});
test('deletion queues exact private capture cleanup and keeps in-flight bytes through uncertainty window',async()=>{
 // Existing deletion fixtures leave eligible cleanup; mark those synthetic jobs complete first.
 await db.exec("UPDATE employer_delivery.capture_cleanup SET state='deleted',storage_path=NULL,sha256=NULL");
 const f=await fixture();await db.query('DELETE FROM public.applications WHERE id=$1',[f.app]);const c=await store.claimCleanup();assert.equal(c.storagePath,f.descriptor.storagePath);
 assert.equal(await store.finishCleanup(c.id,uuid(),true),false);assert.equal(await store.finishCleanup(c.id,c.lease,false),true);assert.equal(await store.claimCleanup(),null);
 await db.query("UPDATE employer_delivery.capture_cleanup SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[c.id]);const retry=await store.claimCleanup();assert.notEqual(retry.lease,c.lease);assert.equal(await store.finishCleanup(c.id,retry.lease,true),true);
 assert.equal((await db.query('SELECT storage_path FROM employer_delivery.capture_cleanup WHERE id=$1',[c.id])).rows[0].storage_path,null);
 const sent=await fixture();await sending(sent);await db.query('DELETE FROM public.applications WHERE id=$1',[sent.app]);assert.equal(await store.claimCleanup(),null);
 const {rows:[queue]}=await db.query('SELECT next_attempt_at FROM employer_delivery.capture_cleanup WHERE application_id=$1',[sent.app]);assert.ok(new Date(queue.next_attempt_at).getTime()>Date.now()+23*60*60*1000);
});
test('invalid applicant mailbox safely freezes nullable ReplyTo and does not block no-CV forwarding',async()=>{
 const f=await fixture({invalidReply:true,attachment:false});const b=readBaseline(f.baseline);assert.equal(b.replyTo,null);assert.equal(b.applicantEmail,null);
 const c=await sending(f);assert.equal(f.email.replyTo,null);assert.equal(await store.finish(f.id,c.lease,{kind:'accepted',providerId:'null-reply-receipt'},null),true);
});
test('pre-registered orphan capture becomes cleanup-eligible; live referenced capture is never removed',async()=>{
 await db.exec("UPDATE employer_delivery.capture_cleanup SET state='deleted',storage_path=NULL,sha256=NULL");
 const f=await fixture(),orphan=uuid(),version=uuid(),path=`${f.applicant}/${orphan}/${version}.pdf`;
 const args={p_application_id:orphan,p_applicant_user_id:f.applicant,p_storage_path:path,p_sha256:'c'.repeat(64)};
 assert.equal(await call(db,'employer_outbox_register_capture',args),true);assert.equal(await call(db,'employer_outbox_register_capture',args),true);
 assert.equal(await call(db,'employer_outbox_register_capture',{...args,p_applicant_user_id:f.employer}),false);
 assert.equal(await call(db,'employer_outbox_register_capture',{...args,p_sha256:'d'.repeat(64)}),false);
 await db.exec("UPDATE employer_delivery.capture_cleanup SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE state='pending'");
 const cleanup=await store.claimCleanup();assert.equal(cleanup.storagePath,path);assert.equal(await store.finishCleanup(cleanup.id,cleanup.lease,true),true);assert.equal(await store.claimCleanup(),null);
 assert.equal(await call(db,'employer_outbox_register_capture',args),false);
});
test('legacy conservative mailbox syntax also forwards through SQL adapter',async()=>{
 const f=await fixture({external:true,register:false}),mailbox='hiring&hr/a/b!hr@example.test';
 // Recreate a new application baseline after the authorized server route changes.
 await db.exec('GRANT SELECT,UPDATE ON public.companies TO service_role');await actAs(db,'','service_role','service_role');await db.query('UPDATE public.companies SET contact_email=$2 WHERE id=$1',[f.company,mailbox]);await actAs(db);
 const job=uuid(),app=uuid();await db.query("INSERT INTO public.job_listings(id,company_id,title,description,status) VALUES($1,$2,'   ','Synthetic','active')",[job,f.company]);
 const applied=await call(db,'employer_screening_apply',{...f.input,p_application_id:app,p_job_id:job,p_attachment:null,p_resume_version_id:null,p_resume_sha256:null});
 await call(db,'employer_screening_register_materials',{p_application_id:app,p_applicant_user_id:f.applicant,p_snapshot_json:null,p_snapshot_sha256:null});
 const c=await store.claim(0);assert.equal(readBaseline(c.item.baseline).to,mailbox);assert.equal(readBaseline(c.item.baseline).jobTitle,'Job opening');assert.equal(applied.employer_delivery_path,'screening');
});
test('adapter quarantines malformed required persisted payload and continues to the next valid row',async()=>{
 const poison=await fixture(),good=await fixture({clear:false});
 // Simulate pre-existing corrupted storage, deliberately bypassing the immutability trigger only in this synthetic test.
 await db.exec('ALTER TABLE employer_delivery.outbox DISABLE TRIGGER protect_outbox');
 try{await db.query(`UPDATE employer_delivery.outbox SET baseline_json=jsonb_set(baseline_json::jsonb,'{applicantName}','null'::jsonb)::text WHERE id=$1`,[poison.id]);await db.query("UPDATE employer_delivery.outbox SET baseline_sha256=encode(sha256(convert_to(baseline_json,'UTF8')),'hex') WHERE id=$1",[poison.id]);}
 finally{await db.exec('ALTER TABLE employer_delivery.outbox ENABLE TRIGGER protect_outbox');}
 const c=await store.claim(0);assert.equal(c.item.id,good.id);assert.equal((await row(poison)).state,'blocked');assert.equal((await row(poison)).last_error_code,'INVALID_PERSISTED_PAYLOAD');
});
test('operator status reveals only bounded operational metadata even after rollout disabled',async()=>{
 const f=await fixture();await db.exec('UPDATE employer_delivery.configuration SET enabled=false');
 const status=await call(db,'employer_outbox_status',{p_application_id:f.app});assert.deepEqual(Object.keys(status).sort(),['state','attempts','first_send_at','accepted_at','next_attempt_at','last_error_code'].sort());assert.equal(status.state,'pending');
 assert.equal(await call(db,'employer_outbox_status',{p_application_id:uuid()}),null);
 await actAs(db,f.employer,'authenticated','authenticated');await assert.rejects(call(db,'employer_outbox_status',{p_application_id:f.app}),/permission denied/);await actAs(db);
});
test('adapter quarantines validly hashed persisted email with wrong baseline routing',async()=>{
 const poison=await fixture(),c=await claimed(poison);await store.freeze(poison.id,c.lease,poison.email);
 const {payloadSha256,...content}=poison.email;void payloadSha256;const changed=captureEmail({...content,to:'other@example.test'});const {payloadSha256:changedDigest,...changedContent}=changed;
 await db.exec('ALTER TABLE employer_delivery.outbox DISABLE TRIGGER protect_outbox');
 try{await db.query("UPDATE employer_delivery.outbox SET frozen_email_json=$2,payload_sha256=$3,lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[poison.id,JSON.stringify(changedContent),changedDigest]);}
 finally{await db.exec('ALTER TABLE employer_delivery.outbox ENABLE TRIGGER protect_outbox');}
 const good=await fixture({clear:false});const result=await store.claim(0);assert.equal(result.item.id,good.id);assert.equal((await row(poison)).state,'blocked');
});
test('pre-send lease recovers before scoring deadline; dispatch receives fresh bounded lease without resetting horizon',async()=>{
 const f=await fixture(),before=Date.now(),c=await claimed(f),r=await row(f);
 assert.ok(new Date(r.lease_expires_at).getTime()<=before+91_000);assert.ok(new Date(r.lease_expires_at).getTime()<=new Date(r.processing_deadline).getTime()-19_000);
 await store.freeze(f.id,c.lease,f.email);const start=Date.now();await store.startSend(f.id,c.lease,f.email.payloadSha256,0);const sent=await row(f);
 assert.ok(new Date(sent.lease_expires_at).getTime()>=start+59_000);assert.ok(new Date(sent.lease_expires_at).getTime()<=Date.now()+61_000);
});
test('paid reservation and dispatch refuse the final 25-second delivery reserve',async()=>{
 const f=await fixture(),c=await claimed(f),cfg=await installBudgetConfig(db,{id:'deadline-reserve'});
 // Synthetic clock-boundary fault injection; production deadline cannot be edited.
 await db.exec('ALTER TABLE employer_delivery.outbox DISABLE TRIGGER protect_outbox');
 try{await db.query("UPDATE employer_delivery.outbox SET processing_deadline=clock_timestamp()+interval '24 seconds' WHERE id=$1",[f.id]);}
 finally{await db.exec('ALTER TABLE employer_delivery.outbox ENABLE TRIGGER protect_outbox');}
 assert.equal(await call(db,'employer_screening_reserve_budget',reserveArgs(f,c.lease,cfg)),null);
 const other=await fixture(),oc=await claimed(other),r=await call(db,'employer_screening_reserve_budget',reserveArgs(other,oc.lease,cfg));assert.ok(r);
 await db.exec('ALTER TABLE employer_delivery.outbox DISABLE TRIGGER protect_outbox');
 try{await db.query("UPDATE employer_delivery.outbox SET processing_deadline=clock_timestamp()+interval '24 seconds' WHERE id=$1",[other.id]);}
 finally{await db.exec('ALTER TABLE employer_delivery.outbox ENABLE TRIGGER protect_outbox');}
 assert.equal(await call(db,'employer_screening_start_request',{p_reservation_id:r.reservation_id,p_lease:oc.lease}),false);
});
test('a previous UTC-day reservation cannot dispatch after midnight or consume the next dispatch-day allowance',async()=>{
 const cfg=await installBudgetConfig(db,{id:'utc-midnight-boundary',daily:200}),old=await fixture(),oc=await claimed(old);
 const reserved=await call(db,'employer_screening_reserve_budget',reserveArgs(old,oc.lease,cfg));assert.equal(reserved.reserved_microusd,200);
 // Deterministic midnight simulation: retain the original full ledger and reservation,
 // but age their accounting day. No production clock override or live wait is required.
 await db.query("UPDATE employer_delivery.budget_days SET day=(clock_timestamp() AT TIME ZONE 'UTC')::date-1 WHERE config_id=$1",[cfg]);
 await db.query("UPDATE employer_delivery.budget_reservations SET day=(clock_timestamp() AT TIME ZONE 'UTC')::date-1 WHERE id=$1",[reserved.reservation_id]);
 assert.equal(await call(db,'employer_screening_start_request',{p_reservation_id:reserved.reservation_id,p_lease:oc.lease}),false);
 const {rows:[unchanged]}=await db.query('SELECT state,charged_microusd,dispatched_at FROM employer_delivery.budget_reservations WHERE id=$1',[reserved.reservation_id]);
 assert.equal(unchanged.state,'reserved');assert.equal(Number(unchanged.charged_microusd),200);assert.equal(unchanged.dispatched_at,null);
 const fresh=await fixture(),fc=await claimed(fresh),today=await call(db,'employer_screening_reserve_budget',reserveArgs(fresh,fc.lease,cfg));assert.ok(today);
 assert.equal(await call(db,'employer_screening_start_request',{p_reservation_id:today.reservation_id,p_lease:fc.lease}),true);
 const {rows:days}=await db.query('SELECT reserved_microusd FROM employer_delivery.budget_days WHERE config_id=$1 ORDER BY day',[cfg]);assert.deepEqual(days.map(x=>Number(x.reserved_microusd)),[200,200]);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM employer_delivery.budget_reservations WHERE config_id=$1 AND state='dispatched'",[cfg])).rows[0].n,1);
});
test('dispatch uses current UTC date rather than the SQL session timezone and rejects future-day reservations too',async()=>{
 const cfg=await installBudgetConfig(db,{id:'utc-session-zone'}),f=await fixture(),c=await claimed(f),r=await call(db,'employer_screening_reserve_budget',reserveArgs(f,c.lease,cfg));
 const {rows:[zone]}=await db.query("SELECT CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC')<10 THEN 'Pacific/Honolulu' ELSE 'Pacific/Kiritimati' END AS name");
 await db.exec(`SET TIME ZONE '${zone.name}'`);
 assert.equal((await db.query("SELECT current_date<>(clock_timestamp() AT TIME ZONE 'UTC')::date AS differs")).rows[0].differs,true);
 try{assert.equal(await call(db,'employer_screening_start_request',{p_reservation_id:r.reservation_id,p_lease:c.lease}),true);}
 finally{await db.exec("SET TIME ZONE 'UTC'");}
 const other=await fixture(),oc=await claimed(other),future=await call(db,'employer_screening_reserve_budget',reserveArgs(other,oc.lease,cfg));
 await db.query("UPDATE employer_delivery.budget_reservations SET day=(clock_timestamp() AT TIME ZONE 'UTC')::date+1 WHERE id=$1",[future.reservation_id]);
 assert.equal(await call(db,'employer_screening_start_request',{p_reservation_id:future.reservation_id,p_lease:oc.lease}),false);
});
