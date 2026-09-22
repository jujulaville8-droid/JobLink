import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canAccessCandidateCv, isDiscoverable } from '../src/lib/candidate-access'
import { resumeSchema, intakeSchema } from '../src/lib/resume-schema'

function client({ visibility='open', pro=true, relationship=false, expired=false, failure=false, role='employer' } = {}) {
 const results: Record<string,unknown> = {
  users:{role,is_admin:false}, companies:{id:'company',is_pro:pro,pro_expires_at:expired?'2000-01-01':null},
  seeker_profiles:{id:'profile',visibility},applications:relationship?{id:'app'}:null,
 }
 return { from(table:string) {
  const q={ select(){return q},eq(){return q},limit(){return q},
   async single(){return {data:results[table],error:failure?new Error('Database unavailable'):null}},
   async maybeSingle(){return q.single()},
  }; return q
 }} as unknown as SupabaseClient
}
test('candidate CV privacy contract includes open candidates and protects private profiles',async()=>{
 assert.equal(isDiscoverable('open'),true);assert.equal(isDiscoverable('actively_looking'),true);assert.equal(isDiscoverable('not_looking'),false)
 for(const visibility of ['open','actively_looking']) assert.equal(await canAccessCandidateCv(client({visibility}),'employer','seeker'),true)
 assert.equal(await canAccessCandidateCv(client({visibility:'not_looking'}),'employer','seeker'),false)
 assert.equal(await canAccessCandidateCv(client({visibility:'not_looking',relationship:true,pro:false}),'employer','seeker'),true)
 assert.equal(await canAccessCandidateCv(client({expired:true}),'employer','seeker'),false)
 assert.equal(await canAccessCandidateCv(client({role:'seeker'}),'stranger','seeker'),false)
 assert.equal(await canAccessCandidateCv(client(),'seeker','seeker'),true)
 await assert.rejects(canAccessCandidateCv(client({failure:true}),'employer','seeker'),/unavailable/)
})
test('resume validation allows honest empty histories and rejects invalid dates and fields',()=>{
 const draft={summary:'',experiences:[],education:[],skills:[]}
 assert.equal(resumeSchema.safeParse(draft).success,true)
 assert.equal(intakeSchema.safeParse({targetRole:'Server',yearsExperience:0,pastRoles:'',topSkills:'',education:''}).success,true)
 const experience={company_name:'Supplied employer',job_title:'Server',location:'',start_date:null,end_date:null,is_current:false,description:''}
 assert.equal(resumeSchema.safeParse({...draft,experiences:[experience]}).success,true)
 assert.equal(resumeSchema.safeParse({...draft,experiences:[{...experience,start_date:'2026-02-31'}]}).success,false)
 assert.equal(resumeSchema.safeParse({...draft,experiences:[{...experience,start_date:'2026-13'}]}).success,false)
 assert.equal(resumeSchema.safeParse({...draft,skills:[1]}).success,false)
 assert.equal(resumeSchema.safeParse({...draft,untrusted:'field'}).success,false)
})
