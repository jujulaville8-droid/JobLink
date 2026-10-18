import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateResumeOrderSchema,writingOrderFields,writingFileFields } from '@/lib/resume-writing';
import { writingBody,writingConfig,writingJson,writingLimit,writingOwner } from '@/lib/resume-writing-server';
import { resumeWritingPolicy } from '@/lib/resume-writing-stripe';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const auth=await writingOwner();if('error' in auth)return auth.error;
    if(process.env.RESUME_WRITING_ENABLED!=='true')return writingJson({error:'Requests unavailable.'},503);
    const {id}=await params;if(!z.uuid().safeParse(id).success)return writingJson({error:'Request not found.'},404);
    const db=createAdminClient();const result=await db.from('resume_writing_orders').select(writingOrderFields).eq('id',id).eq('user_id',auth.user.id).eq('payment_policy',resumeWritingPolicy().key).maybeSingle();
    if(result.error)throw new Error();if(!result.data)return writingJson({error:'Request not found.'},404);
    const files=await db.from('resume_writing_files').select(writingFileFields).eq('order_id',id).eq('revision_number',result.data.revision_count).not('published_at','is',null);
    if(files.error)throw new Error();return writingJson({order:{...result.data,files:files.data??[]}});
  }catch{return writingJson({error:'Could not load request.'},503);}
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const auth=await writingOwner();if('error' in auth)return auth.error;
    if(!writingConfig().intakeEnabled)return writingJson({error:'Requests are unavailable.'},503);
    const {id}=await params;const body=updateResumeOrderSchema.safeParse(await writingBody(request));
    if(!z.uuid().safeParse(id).success || !body.success)return writingJson({error:'Check your questionnaire or request.'},400);
    const limited=await writingLimit(auth.user.id);if(limited)return limited;
    const data=body.data,db=createAdminClient(),policy=resumeWritingPolicy();
    const result=data.action==='save'||data.action==='submit'
      ?await db.rpc('update_resume_writing_intake',{p_id:id,p_user_id:auth.user.id,p_version:data.version,p_intake:data.intake,p_submit:data.action==='submit',p_policy:policy.key})
      :await db.rpc('respond_resume_writing_draft',{p_id:id,p_user_id:auth.user.id,p_version:data.version,p_action:data.action,p_note:data.action==='revision'?data.note:null,p_request_id:data.action==='revision'?data.requestId:null,p_policy:policy.key});
    if(result.error || !result.data)return writingJson({error:'Request changed or this action is unavailable. Refresh saved status before retrying.'},409);
    return writingJson({order:result.data});
  } catch{return writingJson({error:'Could not update the request. Your changes are still on this page.'},400);}
}
