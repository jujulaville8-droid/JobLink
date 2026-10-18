import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResumeWritingStripe, resumeWritingPolicy } from '@/lib/resume-writing-stripe';
import { reconcileResumeWritingSession } from '@/lib/resume-writing-payment';
import { verifiedWritingBytes } from '@/lib/resume-writing-files';
import { writingBody, writingJson } from '@/lib/resume-writing-server';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(); if ('error' in auth) return auth.error;
    if (process.env.RESUME_WRITING_ENABLED !== 'true') return writingJson({ error: 'Service is disabled.' }, 503);
    const { id } = await params;
    const body = z.discriminatedUnion('status',[
      z.object({version:z.number().int().nonnegative(),status:z.literal('writing')}).strict(),
      z.object({version:z.number().int().nonnegative(),status:z.literal('draft_ready'),reviewed:z.literal(true),pdfId:z.uuid(),editableId:z.uuid()}).strict(),
    ]).safeParse(await writingBody(request));
    if (!z.uuid().safeParse(id).success || !body.success) return writingJson({ error: 'Check the requested status and reviewed files.' }, 400);
    const db = createAdminClient();
    const order = await db.from('resume_writing_orders').select('paid_session_id,revision_count').eq('id',id).eq('payment_policy',resumeWritingPolicy().key).maybeSingle();
    if (order.error) return writingJson({ error: 'Could not load request.' }, 503);
    if (!order.data?.paid_session_id) return writingJson({ error: 'Verified payment is required.' }, 409);
    await reconcileResumeWritingSession(getResumeWritingStripe(),db,{id:`admin:${randomUUID()}`,type:'admin.pre_fulfillment'},order.data.paid_session_id);
    let result;
    if(body.data.status==='draft_ready') {
      const pair=await db.from('resume_writing_files').select('id,kind,object_path,sha256,size').eq('order_id',id).eq('revision_number',order.data.revision_count).in('id',[body.data.pdfId,body.data.editableId]);
      if(pair.error || pair.data?.length!==2)return writingJson({error:'Upload and review both documents first.'},409);
      for(const file of pair.data)await verifiedWritingBytes(db,file);
      result=await db.rpc('publish_resume_writing_draft',{p_id:id,p_actor_id:auth.user.id,p_version:body.data.version,p_pdf:body.data.pdfId,p_editable:body.data.editableId,p_reviewed:true});
    } else result=await db.rpc('update_resume_writing_fulfillment', { p_id:id,p_actor_id:auth.user.id,p_version:body.data.version,p_status:'writing',p_delivered:false });
    if (result.error) return writingJson({ error: 'Status changed, payment needs review, or this transition is unavailable. Refresh before retrying.' },409);
    return writingJson({ success:true });
  } catch { return writingJson({ error: 'Payment or documents could not be checked. Status was not approved.' },503); }
}
