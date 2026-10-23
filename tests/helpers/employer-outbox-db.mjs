import { readFileSync } from 'node:fs';
import { setupClaimsDb, actAs, user, uuid } from './claims-db.mjs';
import { captureSnapshot, captureDocumentQuality, readDocumentQuality, readBaseline, composeBaseline } from '../../src/lib/employer-screening/index.ts';
import { assessResumeDocumentQuality } from '../../src/lib/employer-screening/quality.ts';
import { SupabaseOutboxStore } from '../../src/lib/employer-screening/supabase-outbox-store.ts';
export { actAs, user, uuid };
export const outboxSql=readFileSync('docs/employer-screening/drafts/employer-outbox.unapplied.sql','utf8');
export async function setupOutboxDb(db) { await setupClaimsDb(db); await db.exec(outboxSql); }
export function rpcClient(db) {
  return {async rpc(name,args={}) {
    // Names come from our fixed service adapter; arbitrary function/argument SQL is rejected.
    if(!/^employer_(outbox|screening)_[a-z_]+$/.test(name)||Object.keys(args).some(k=>!/^p_[a-z0-9_]+$/.test(k))) throw new Error('Invalid test RPC');
    try {const keys=Object.keys(args),{rows}=await db.query(`SELECT public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) AS value`,keys.map(k=>args[k]));return {data:rows[0].value,error:null};}
    catch(error){return {data:null,error};}
  }};
}
export function outboxStore(db) {return new SupabaseOutboxStore(rpcClient(db));}
export async function call(db,name,args={}) {const {data,error}=await rpcClient(db).rpc(name,args);if(error)throw error;return data;}
export async function outboxRow(db,f) {return (await db.query('SELECT * FROM employer_delivery.outbox WHERE id=$1',[f.id])).rows[0];}
export function documentQualityFixture(sourceSha256='a'.repeat(64),page='Experience\nRole: Office assistant\nTask: Maintained records\nEmployer: Example business') {
  return captureDocumentQuality(assessResumeDocumentQuality({sourceSha256,localPages:[page]},sourceSha256),sourceSha256);
}
export async function outboxFixture(db,{enabled=true,attachment=true,rubric=true,quality=false,register=true,clear=true,external=false,invalidReply=false}={}) {
  await actAs(db);
  if(clear)await db.exec("UPDATE employer_delivery.outbox SET state='blocked' WHERE state IN ('pending','claimed','ready','sending')");
  await db.query('UPDATE employer_delivery.configuration SET enabled=$1',[enabled]);
  const employer=await user(db),applicant=await user(db,'seeker',invalidReply?'invalid-address':undefined),company=uuid(),job=uuid(),app=uuid(),version=uuid();
  if(external){await db.exec('GRANT SELECT,INSERT,UPDATE ON public.companies TO service_role');await actAs(db,'','service_role','service_role');}
  await db.query("INSERT INTO public.companies(id,user_id,company_name,contact_email) VALUES($1,$2,'Synthetic employer',$3)",[company,employer,external?'external@example.test':null]);
  if(external)await actAs(db);
  await db.query("INSERT INTO public.job_listings(id,company_id,title,description,status) VALUES($1,$2,'Test job','Synthetic','active')",[job,company]);
  const {rows:[profile]}=await db.query("INSERT INTO public.seeker_profiles(user_id,first_name,last_name) VALUES($1,'Test','Applicant') RETURNING id",[applicant]);
  let approved=null;
  if(rubric) approved=await call(db,'employer_screening_approve_rubric',{p_job_id:job,p_owner_user_id:employer,p_expected_version:null,
    p_criteria:JSON.stringify([{id:'skill',label:'Test skill',category:'skill',weight:100,verificationRequired:false}])});
  const descriptor=attachment?{storagePath:`${applicant}/${app}/${version}.pdf`,filename:'capture.pdf',sha256:'a'.repeat(64),bytes:123}:null;
  if(descriptor)await call(db,'employer_outbox_register_capture',{p_application_id:app,p_applicant_user_id:applicant,p_storage_path:descriptor.storagePath,p_sha256:descriptor.sha256});
  const input={p_application_id:app,p_job_id:job,p_applicant_user_id:applicant,p_cover_letter_text:'Synthetic application',
    p_resume_version_id:attachment?version:null,p_resume_sha256:attachment?'a'.repeat(64):null,p_attachment:descriptor?JSON.stringify(descriptor):null};
  const result=await call(db,'employer_screening_apply',input);
  const baseline={json:result.baseline_json,sha256:result.baseline_sha256},b=readBaseline(baseline);
  const snapshot=attachment&&approved?captureSnapshot({applicationId:app,jobId:job,companyId:company,createdAt:b.createdAt,
    resume:{versionId:version,sha256:'a'.repeat(64),evidence:[]},job:{title:'Test job',versionId:'job-v1'},rubric:approved}):null;
  const frozenQuality=attachment&&quality?documentQualityFixture():null;
  if(register&&enabled)await call(db,'employer_screening_register_materials',{p_application_id:app,p_applicant_user_id:applicant,p_snapshot_json:snapshot?.json??null,p_snapshot_sha256:snapshot?.sha256??null,
    ...(frozenQuality?{p_quality_json:frozenQuality.json,p_quality_sha256:frozenQuality.sha256}:{})});
  const {rows:[row]}=await db.query('SELECT id FROM employer_delivery.outbox WHERE application_id=$1',[app]);
  return {id:row.id,app,job,company,employer,applicant,profile:profile.id,baseline,snapshot,quality:frozenQuality,
    email:composeBaseline(b,{status:'unavailable'},frozenQuality?readDocumentQuality(frozenQuality,b.resumeSha256):undefined),descriptor,approved,input,result};
}
export async function installBudgetConfig(db,{id='synthetic-exact-v1',daily=1000,verified=true}={}) {
  await db.query(`INSERT INTO employer_delivery.budget_configuration(id,enabled,context_bound_verified,provider,model,
    input_microusd_per_million,output_microusd_per_million,max_input_tokens,max_output_tokens,per_application_microusd,daily_microusd)
    VALUES($1,true,$3,'openai','gpt-6-luna',1000000,2000000,100,50,200,$2) ON CONFLICT DO NOTHING`,[id,daily,verified]);return id;
}
export function reserveArgs(f,lease,config='synthetic-exact-v1'){return {p_application_id:f.app,p_lease:lease,p_snapshot_sha256:f.snapshot.sha256,
  p_config_id:config,p_input_token_ceiling:null,p_max_output_tokens:50,p_request_key:'screening-v1'};}
