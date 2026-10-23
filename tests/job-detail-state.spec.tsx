import {expect,it,vi} from 'vitest';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
import {loadApplyState} from '@/lib/job-detail';
const USER='11111111-1111-4111-8111-111111111111',JOB='22222222-2222-4222-8222-222222222222',PROFILE='33333333-3333-4333-8333-333333333333';
function fixture({anonymous=false,role='seeker',missing='',builder=false,applied=false,saved=false,profile=true}={}){
 const filters:unknown[][]=[];
 const client={auth:{getUser:async()=>({data:{user:anonymous?null:{id:USER}}})},from(table:string){const query={select:()=>query,eq:(key:string,value:string)=>{filters.push([table,key,value]);return query},single:async()=>result(),maybeSingle:async()=>result()};
  function result(){return {data:table==='users'?{role}:table==='seeker_profiles'?(profile?{id:PROFILE,first_name:missing==='first'?'':'Test',last_name:missing==='last'?'':'Seeker',phone:missing==='phone'?'':'+12685550100',cv_url:missing==='cv'?null:'synthetic/cv.pdf'}:null):table==='cv_profiles'?(builder?{id:'builder-profile'}:null):table==='applications'?(applied?{id:'existing'}:null):table==='saved_jobs'?(saved?{id:'saved'}:null):null,error:null}}return query;}};
 return {client:client as unknown as Parameters<typeof loadApplyState>[0],filters};
}
it.each([
 [{anonymous:true},false,'login'],[{role:'employer'},false,'not-seeker'],[{profile:false},false,'profile-incomplete'],
 [{missing:'first'},false,'profile-incomplete'],[{missing:'last'},false,'profile-incomplete'],[{missing:'phone'},false,'profile-incomplete'],
 [{missing:'cv'},false,'profile-incomplete'],[{missing:'cv',builder:true},false,'apply'],[{},false,'apply'],
 [{applied:true},false,'applied'],[{anonymous:true},true,'closed'],[{applied:true},true,'closed'],
] as const)('resolves the guarded Apply state for %j / closed=%s',async(options,closed,expected)=>{
 const f=fixture(options);expect((await loadApplyState(f.client,JOB,closed)).applyState).toBe(expected);
});
it('reads saved state for an incomplete seeker without treating it as application readiness',async()=>{
 const f=fixture({missing:'phone',saved:true});expect(await loadApplyState(f.client,JOB,false)).toMatchObject({applyState:'profile-incomplete',isSaved:true});
 expect(f.filters).toContainEqual(['saved_jobs','job_id',JOB]);expect(f.filters).toContainEqual(['saved_jobs','seeker_id',PROFILE]);
 expect(f.filters).toContainEqual(['seeker_profiles','user_id',USER]);
});
it('binds the built résumé lookup to the authenticated owner and retains prior-application state',async()=>{
 const f=fixture({missing:'cv',builder:true,applied:true});expect((await loadApplyState(f.client,JOB,false)).applyState).toBe('applied');expect(f.filters).toContainEqual(['cv_profiles','user_id',USER]);expect(f.filters).toContainEqual(['applications','job_id',JOB]);expect(f.filters).toContainEqual(['applications','seeker_id',PROFILE]);
});
