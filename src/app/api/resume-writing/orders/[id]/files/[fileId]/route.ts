import { randomUUID } from 'node:crypto';
import { resumeContentDisposition,resumeFilename } from '@/lib/resume-filename';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { writingJson,writingOwner } from '@/lib/resume-writing-server';
import { getResumeWritingStripe,resumeWritingPolicy } from '@/lib/resume-writing-stripe';
import { reconcileResumeWritingSession } from '@/lib/resume-writing-payment';
import { verifiedWritingBytes,writingMime } from '@/lib/resume-writing-files';

export async function GET(request:Request,{params}:{params:Promise<{id:string;fileId:string}>}) {
  try {
    const preview=new URL(request.url).searchParams.get('review')==='true';
    const auth=preview?await requireAdmin():await writingOwner();if('error' in auth)return auth.error;
    if(process.env.RESUME_WRITING_ENABLED!=='true')return writingJson({error:'Documents unavailable.'},503);
    const {id,fileId}=await params;if(!z.uuid().safeParse(id).success || !z.uuid().safeParse(fileId).success)return writingJson({error:'Document not found.'},404);
    const db=createAdminClient();let query=db.from('resume_writing_orders').select('intake,paid_session_id,payment_status,payment_review_required,revision_count,fulfillment_status').eq('id',id).eq('payment_policy',resumeWritingPolicy().key);
    if(!preview)query=query.eq('user_id',auth.user.id);
    const order=await query.maybeSingle();
    if(order.error)throw new Error();if(!order.data?.paid_session_id)return writingJson({error:'Document not found.'},404);
    await reconcileResumeWritingSession(getResumeWritingStripe(),db,{id:`download:${randomUUID()}`,type:'document.pre_download'},order.data.paid_session_id);
    const current=await db.from('resume_writing_orders').select('payment_status,payment_review_required,revision_count').eq('id',id).maybeSingle();
    if(current.error || current.data?.payment_status!=='paid' || current.data.payment_review_required)return writingJson({error:'Document unavailable while payment is reviewed.'},409);
    let files=db.from('resume_writing_files').select('kind,object_path,sha256,size,published_at').eq('id',fileId).eq('order_id',id).eq('revision_number',current.data.revision_count);
    if(!preview)files=files.not('published_at','is',null);
    const file=await files.maybeSingle();if(file.error)throw new Error();if(!file.data)return writingJson({error:'Document not found.'},404);
    const kind=file.data.kind as 'pdf'|'editable';const bytes=await verifiedWritingBytes(db,file.data);
    const name=typeof order.data.intake?.name==='string'?order.data.intake.name:undefined;
    const filename=resumeFilename(name,undefined,kind==='pdf'?'pdf':'docx');
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':writingMime[kind],'Content-Disposition':resumeContentDisposition(filename),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
  } catch{return writingJson({error:'Document unavailable. Please retry later.'},503);}
}
