import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { testDatabase, seed, ids, asUser, system } from './database'
let db: PGlite
before(async()=>{ db=await testDatabase(); await seed(db) })
after(async()=>{ await db?.close() })

test('company entitlement and billing identity tampering is rejected',async()=>{
 await asUser(db,ids.employer)
 for(const assignment of ['is_pro=true','is_verified=true',"pro_expires_at=now()+interval '1 year'","stripe_customer_id='cus_fake'"]) {
  await assert.rejects(db.query(`UPDATE companies SET ${assignment} WHERE id=$1`,[ids.company]),/privileges/)
 }
 await assert.rejects(db.query("UPDATE users SET stripe_customer_id='cus_fake' WHERE id=$1",[ids.employer]),/server-managed/)
})
test('listing approval, featured flags and the free quota cannot be bypassed',async()=>{
 await asUser(db,ids.employer)
 await assert.rejects(db.query("UPDATE job_listings SET is_featured=true WHERE id=$1",[ids.job]),/privileges/)
 await assert.rejects(db.query("INSERT INTO job_listings(company_id,title,description,status) VALUES($1,'bad','bad','active')",[ids.company]),/approval/)
 await assert.rejects(db.query("INSERT INTO job_listings(company_id,title,description) VALUES($1,'second','second')",[ids.company]),/one active or pending/)
 await db.query("UPDATE job_listings SET title='Changed content' WHERE id=$1",[ids.job])
 assert.equal((await db.query<{status:string}>('SELECT status FROM job_listings WHERE id=$1',[ids.job])).rows[0].status,'pending_approval')
 await assert.rejects(db.query("UPDATE job_listings SET status='active' WHERE id=$1",[ids.job]),/approval/)
 await system(db); await db.query("UPDATE job_listings SET status='active' WHERE id=$1",[ids.job])
})
test('CV paths must belong to the profile owner, even through direct SQL',async()=>{
 await system(db)
 await db.query("INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('cvs',$1,$2)",[`${ids.seeker}/own.pdf`,ids.seeker])
 await db.query("INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('cvs',$1,$2)",[`${ids.stranger}/private.pdf`,ids.stranger])
 await asUser(db,ids.seeker)
 await assert.rejects(db.query('UPDATE seeker_profiles SET cv_url=$1 WHERE id=$2',[`${ids.stranger}/private.pdf`,ids.profile]),/own uploaded/)
 await db.query('UPDATE seeker_profiles SET cv_url=$1 WHERE id=$2',[`${ids.seeker}/own.pdf`,ids.profile])
 await system(db)
 for(const path of [`${ids.seeker}/../private.pdf`,`${ids.stranger}/private.pdf`,`${ids.seeker}/missing.pdf`]) {
  assert.equal((await db.query<{ok:boolean}>('SELECT owns_cv_object($1,$2) ok',[ids.seeker,path])).rows[0].ok,false)
 }
})
test('application-message flow and unrelated-user isolation',async()=>{
 await asUser(db,ids.seeker)
 await db.query('INSERT INTO applications(id,job_id,seeker_id) VALUES($1,$2,$3)',[ids.application,ids.job,ids.profile])
 await system(db)
 await db.query('INSERT INTO conversations(id,application_id) VALUES($1,$2)',[ids.conversation,ids.application])
 await db.query("INSERT INTO conversation_participants(conversation_id,user_id,last_read_at) VALUES($1,$2,now()-interval '1 hour'),($1,$3,now()-interval '1 hour')",[ids.conversation,ids.seeker,ids.employer])
 await asUser(db,ids.employer)
 await db.query("INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,'Hello applicant')",[ids.conversation,ids.employer])
 await asUser(db,ids.seeker)
 const inbox=await db.query('SELECT * FROM get_inbox($1,false)',[ids.seeker]); assert.equal(inbox.rows.length,1)
 await db.query("INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,'Thank you')",[ids.conversation,ids.seeker])
 await asUser(db,ids.stranger)
 assert.equal((await db.query('SELECT * FROM messages')).rows.length,0)
 assert.equal((await db.query('SELECT * FROM get_conversation_meta($1,$2)',[ids.stranger,ids.conversation])).rows.length,0)
 await assert.rejects(db.query('SELECT * FROM get_inbox($1,false)',[ids.seeker]),/Identity mismatch/)
 await assert.rejects(db.query('SELECT * FROM get_conversation_meta($1,$2)',[ids.seeker,ids.conversation]),/Identity mismatch/)
 await assert.rejects(db.query('SELECT upsert_presence($1)',[ids.seeker]),/Identity mismatch/)
 assert.equal((await db.query<{count:number}>('SELECT get_total_unread_count($1) count',[ids.seeker])).rows[0].count,0)
 await asUser(db,'','anon'); await assert.rejects(db.query('SELECT * FROM get_inbox($1,false)',[ids.seeker]),/permission denied/)
})
test('payment event retries are atomic, deduplicated and ordered',async()=>{
 await system(db)
 const event={id:'evt_purchase',type:'checkout.session.completed',kind:'purchase',user_id:ids.seeker,session_id:'cs_test'}
 await db.query('SELECT process_stripe_event($1)',[event]); await db.query('SELECT process_stripe_event($1)',[event])
 assert.equal((await db.query('SELECT * FROM ai_purchases')).rows.length,1)
 await assert.rejects(db.query('SELECT process_stripe_event($1)',[{...event,id:'evt_failed',session_id:'cs_failed',user_id:'00000000-0000-4000-8000-000000000099'}]),/foreign key/)
 assert.equal((await db.query("SELECT * FROM stripe_events WHERE id='evt_failed'")).rows.length,0)
 await db.query('SELECT process_stripe_event($1)',[{...event,id:'evt_failed',session_id:'cs_failed'}])
 const sub={id:'evt_sub',type:'customer.subscription.updated',kind:'subscription',created:200,user_id:ids.employer,company_id:ids.company,subscription_id:'sub_test',customer_id:'cus_test',status:'active',current_period_end:'2099-01-01T00:00:00Z'}
 await db.query('SELECT process_stripe_event($1)',[sub])
 await db.query('SELECT process_stripe_event($1)',[{...sub,id:'evt_old',created:100,status:'past_due'}])
 assert.equal((await db.query<{is_pro:boolean}>('SELECT is_pro FROM companies WHERE id=$1',[ids.company])).rows[0].is_pro,true)
 await db.query('SELECT process_stripe_event($1)',[{...sub,id:'evt_cancel',created:300,status:'canceled'}])
 assert.equal((await db.query<{is_pro:boolean}>('SELECT is_pro FROM companies WHERE id=$1',[ids.company])).rows[0].is_pro,false)
 await asUser(db,ids.employer); await assert.rejects(db.query('SELECT process_stripe_event($1)',[sub]),/permission denied/)
})
test('failed resume replacement rolls back every section and preserves the preview',async()=>{
 await system(db)
 await db.query("INSERT INTO cv_profiles(user_id,summary) VALUES($1,'Original summary')",[ids.seeker])
 const profile=(await db.query<{id:string}>('SELECT id FROM cv_profiles WHERE user_id=$1',[ids.seeker])).rows[0].id
 await db.query("INSERT INTO cv_skills(cv_profile_id,name) VALUES($1,'Original skill')",[profile])
 const draft={summary:'New summary',experiences:[],education:[],skills:['New skill'],languages:[{name:null,proficiency:'Fluent'}],projects:[],volunteer:[]}
 await db.query("INSERT INTO ai_resume_previews(user_id,preview_data,created_at) VALUES($1,$2,'2026-09-22T12:00:00Z')",[ids.seeker,draft])
 await assert.rejects(db.query("SELECT unlock_resume($1,'2026-09-22T12:00:00Z',true)",[ids.seeker]),/null value/)
 assert.equal((await db.query<{summary:string}>('SELECT summary FROM cv_profiles WHERE id=$1',[profile])).rows[0].summary,'Original summary')
 assert.equal((await db.query<{name:string}>('SELECT name FROM cv_skills WHERE cv_profile_id=$1',[profile])).rows[0].name,'Original skill')
 assert.equal((await db.query('SELECT * FROM ai_resume_previews')).rows.length,1)
 await assert.rejects(db.query("SELECT unlock_resume($1,'2026-09-22T12:00:00Z',false)",[ids.seeker]),/Confirmation/)
 await assert.rejects(db.query("SELECT unlock_resume($1,'2026-09-22T13:00:00Z',true)",[ids.seeker]),/Draft changed/)
 draft.languages=[]; await db.query('UPDATE ai_resume_previews SET preview_data=$1 WHERE user_id=$2',[draft,ids.seeker])
 await db.query("SELECT unlock_resume($1,'2026-09-22T12:00:00Z',true)",[ids.seeker])
 assert.equal((await db.query('SELECT * FROM ai_resume_previews')).rows.length,0)
 assert.equal((await db.query<{name:string}>('SELECT name FROM cv_skills WHERE cv_profile_id=$1',[profile])).rows[0].name,'New skill')
})
test('reminder claims prevent duplicate delivery and never log failed sends',async()=>{
 await system(db)
 await db.query("INSERT INTO email_outbox(id,user_id,recipient,email_type) VALUES('mail_1',$1,'test@example.test','signup_reminder_1')",[ids.seeker])
 const claim=(await db.query<{claim_token:string}>("SELECT * FROM claim_reminder('mail_1')")).rows[0]
 assert.ok(claim.claim_token)
 assert.equal((await db.query("SELECT * FROM claim_reminder('mail_1')")).rows.length,0)
 assert.equal((await db.query('SELECT * FROM signup_reminder_log')).rows.length,0)
 await db.query("SELECT finish_reminder('mail_1',$1,'provider_id')",[claim.claim_token])
 assert.equal((await db.query('SELECT * FROM signup_reminder_log')).rows.length,1)
 assert.equal((await db.query("SELECT * FROM claim_reminder('mail_1')")).rows.length,0)
 await db.query("INSERT INTO email_outbox(id,user_id,recipient,email_type,first_attempt_at) VALUES('ambiguous',$1,'test@example.test','signup_reminder_2',now()-interval '25 hours')",[ids.seeker])
 assert.equal((await db.query("SELECT * FROM claim_reminder('ambiguous')")).rows.length,0)
 assert.equal((await db.query<{status:string}>("SELECT status FROM email_outbox WHERE id='ambiguous'")).rows[0].status,'needs_review')
})

test('direct employer invitations remain usable without an application',async()=>{
 await system(db)
 const conversation=(await db.query<{id:string}>('INSERT INTO conversations(application_id) VALUES(NULL) RETURNING id')).rows[0].id
 await db.query('INSERT INTO conversation_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)',[conversation,ids.employer,ids.seeker])
 await asUser(db,ids.employer)
 await db.query("INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,'Invitation')",[conversation,ids.employer])
 await asUser(db,ids.seeker)
 await db.query("INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,'Interested')",[conversation,ids.seeker])
 assert.equal((await db.query('SELECT * FROM messages WHERE conversation_id=$1',[conversation])).rows.length,2)
 await assert.rejects(db.query('UPDATE conversation_participants SET conversation_id=$1 WHERE user_id=$2',[ids.conversation,ids.seeker]),/permission denied/)
})
test('pre-company subscriptions are retained and linked when the employer creates a profile',async()=>{
 await system(db)
 const user='00000000-0000-4000-8000-000000000009'
 await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'new-employer@example.test','{\"role\":\"employer\"}')",[user])
 await db.query('SELECT process_stripe_event($1)',[{id:'evt_before_company',type:'checkout.session.completed',kind:'subscription',created:400,user_id:user,subscription_id:'sub_before_company',customer_id:'cus_before_company',status:'active',current_period_end:'2099-01-01T00:00:00Z'}])
 await asUser(db,user)
 const company=(await db.query<{id:string,is_pro:boolean}>("INSERT INTO companies(user_id,company_name) VALUES($1,'New company') RETURNING id,is_pro",[user])).rows[0]
 assert.equal(company.is_pro,true)
 assert.equal((await db.query<{company_id:string}>("SELECT company_id FROM subscriptions WHERE stripe_subscription_id='sub_before_company'")).rows[0].company_id,company.id)
})
test('user privilege escalation is blocked even without a pre-existing June trigger',async()=>{
 await asUser(db,ids.seeker)
 for(const assignment of ['is_admin=true',"role='admin'",'email_verified=true']) {
  await assert.rejects(db.query(`UPDATE users SET ${assignment} WHERE id=$1`,[ids.seeker]),/Privileged user fields/)
 }
})

test('additive migrations also apply to the observed restored table shapes',async()=>{
 const restored=await testDatabase(true)
 try {
  await seed(restored)
  await restored.query('SELECT process_stripe_event($1)',[{id:'evt_restored',type:'checkout.session.completed',kind:'purchase',user_id:ids.seeker,session_id:'cs_restored'}])
  assert.equal((await restored.query('SELECT purchased_at FROM ai_purchases')).rows.length,1)
  await asUser(restored,ids.seeker)
  await assert.rejects(restored.query("INSERT INTO ai_purchases(user_id,feature) VALUES($1,'smart_resume')",[ids.seeker]),/permission denied/)
 } finally { await restored.close() }
})
