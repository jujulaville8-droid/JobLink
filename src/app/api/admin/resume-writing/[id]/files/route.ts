import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResumeWritingStripe,resumeWritingPolicy } from '@/lib/resume-writing-stripe';
import { reconcileResumeWritingSession } from '@/lib/resume-writing-payment';
import { privateWritingStorage,validateWritingFile,writingHash,writingMime,writingMultipart } from '@/lib/resume-writing-files';
import { writingJson } from '@/lib/resume-writing-server';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const auth=await requireAdmin();if('error' in auth)return auth.error;
    if(process.env.RESUME_WRITING_ENABLED!=='true')return writingJson({error:'Service is disabled.'},503);
    const {id}=await params;if(!z.uuid().safeParse(id).success)return writingJson({error:'Request not found.'},404);
    const form=await writingMultipart(request);
    const metadata=z.object({id:z.uuid(),version:z.coerce.number().int().nonnegative(),kind:z.enum(['pdf','editable'])}).safeParse({id:form.get('id'),version:form.get('version'),kind:form.get('kind')});
    const file=form.get('file');if(!metadata.success || !file || typeof file==='string')return writingJson({error:'Choose a PDF or DOCX and a current request.'},400);
    const {kind,version}=metadata.data;
    if(file.type!==writingMime[kind] || !file.name.toLowerCase().endsWith(kind==='pdf'?'.pdf':'.docx'))return writingJson({error:'The file extension and format must match PDF or DOCX.'},400);
    const bytes=Buffer.from(await file.arrayBuffer());validateWritingFile(bytes,kind);const hash=writingHash(bytes),db=createAdminClient();
    const result=await db.from('resume_writing_orders').select('paid_session_id,version,fulfillment_status,intake_status,revision_count,payment_status,payment_review_required').eq('id',id).eq('payment_policy',resumeWritingPolicy().key).maybeSingle();
    if(result.error)return writingJson({error:'Could not load request.'},503);
    const order=result.data;
    if(!order?.paid_session_id || order.version!==version || order.fulfillment_status!=='writing' || order.intake_status!=='complete' || order.payment_status!=='paid' || order.payment_review_required)return writingJson({error:'Refresh the request. Clear payment and completed intake are required.'},409);
    await reconcileResumeWritingSession(getResumeWritingStripe(),db,{id:`upload:${randomUUID()}`,type:'admin.pre_upload'},order.paid_session_id);
    const path=`${id}/${order.revision_count}/${metadata.data.id}.${kind==='pdf'?'pdf':'docx'}`;
    const storage=await privateWritingStorage(db);
    const upload=await storage.upload(path,bytes,{contentType:writingMime[kind],upsert:false});
    if(upload.error) {
      // An uncertain upload can be retried with the same ID and bytes, never overwritten.
      const existing=await storage.download(path);
      if(existing.error || !existing.data || writingHash(new Uint8Array(await existing.data.arrayBuffer()))!==hash)return writingJson({error:'Upload not confirmed. Retry the same selected file.'},503);
    }
    const saved=await db.rpc('register_resume_writing_file',{p_id:metadata.data.id,p_order_id:id,p_actor_id:auth.user.id,p_version:version,p_kind:kind,p_sha256:hash,p_size:bytes.length,p_mime:writingMime[kind]});
    if(saved.error || !saved.data)return writingJson({error:'Private upload was not registered. Refresh before retrying; nothing was published.'},409);
    return writingJson({file:saved.data},201);
  } catch{return writingJson({error:'Upload unavailable. Use a valid PDF or DOCX up to 5 MB; nothing was published.'},400);}
}
