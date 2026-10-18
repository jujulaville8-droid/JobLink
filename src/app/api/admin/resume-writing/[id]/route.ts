import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResumeWritingStripe, resumeWritingPolicy } from '@/lib/resume-writing-stripe';
import { reconcileResumeWritingSession } from '@/lib/resume-writing-payment';
import { writingBody, writingJson } from '@/lib/resume-writing-server';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(); if ('error' in auth) return auth.error;
    if (process.env.RESUME_WRITING_ENABLED !== 'true') return writingJson({ error: 'Service is disabled.' }, 503);
    const { id } = await params;
    const body = z.object({ version: z.number().int().nonnegative(), status: z.enum(['writing','draft_ready','revision_requested','complete']), delivered: z.boolean() }).strict().safeParse(await writingBody(request));
    if (!z.uuid().safeParse(id).success || !body.success) return writingJson({ error: 'Check the requested status.' }, 400);
    const db = createAdminClient();
    const order = await db.from('resume_writing_orders').select('paid_session_id').eq('id',id).eq('payment_policy',resumeWritingPolicy().key).maybeSingle();
    if (order.error) return writingJson({ error: 'Could not load request.' }, 503);
    if (!order.data?.paid_session_id) return writingJson({ error: 'Verified payment is required.' }, 409);
    // Recheck Stripe immediately before manual work/delivery. Refund/dispute
    // events can be delayed; the DB transaction then enforces current state.
    await reconcileResumeWritingSession(getResumeWritingStripe(),db,{id:`admin:${randomUUID()}`,type:'admin.pre_fulfillment'},order.data.paid_session_id);
    const result = await db.rpc('update_resume_writing_fulfillment', { p_id:id,p_actor_id:auth.user.id,p_version:body.data.version,p_status:body.data.status,p_delivered:body.data.delivered });
    if (result.error) return writingJson({ error: 'Status changed, payment needs review, or this transition is unavailable. Refresh before retrying.' },409);
    return writingJson({ success:true });
  } catch { return writingJson({ error: 'Payment could not be checked. Status was not approved.' },503); }
}
