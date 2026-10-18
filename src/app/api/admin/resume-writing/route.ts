import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResumeWritingStripe, resumeWritingPolicy, resumeWritingSessionId } from '@/lib/resume-writing-stripe';
import { writingOrderFields } from '@/lib/resume-writing';
import { reconcileResumeWritingSession } from '@/lib/resume-writing-payment';
import { writingBody, writingJson } from '@/lib/resume-writing-server';

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(); if ('error' in auth) return auth.error;
    if (process.env.RESUME_WRITING_ENABLED !== 'true') return writingJson({ orders: [], unmatched: [], disabled: true });
    const page = Math.max(1, Math.min(10000, Math.floor(Number(new URL(request.url).searchParams.get('page')) || 1)));
    const db = createAdminClient();
    const [orders, unmatched] = await Promise.all([
      db.from('resume_writing_orders').select(writingOrderFields, { count: 'exact' }).neq('payment_status','unpaid')
        .eq('payment_policy',resumeWritingPolicy().key).order('created_at', { ascending: false }).range((page-1)*25,page*25-1),
      db.from('resume_writing_events').select('event_id,session_id,created_at').eq('outcome','unmatched').order('created_at',{ ascending:false }).limit(10),
    ]);
    if (orders.error || unmatched.error) return writingJson({ error: 'Could not load paid requests.' }, 503);
    return writingJson({ orders: orders.data, unmatched: unmatched.data, page, paymentMode:resumeWritingPolicy().mode, hasNext: (orders.count ?? 0) > page*25 });
  } catch { return writingJson({ error: 'Could not load paid requests.' }, 503); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(); if ('error' in auth) return auth.error;
    if (process.env.RESUME_WRITING_ENABLED !== 'true') return writingJson({ error: 'Service is disabled.' }, 503);
    const body = z.object({ sessionId: z.string().refine(resumeWritingSessionId) }).strict().safeParse(await writingBody(request));
    if (!body.success) return writingJson({ error: 'Provide a Checkout Session ID.' }, 400);
    const result = await reconcileResumeWritingSession(getResumeWritingStripe(),createAdminClient(),{id:`manual:${randomUUID()}`,type:'manual.reconciliation'},body.data.sessionId);
    return writingJson(result, result.outcome === 'unmatched' ? 409 : 200);
  } catch { return writingJson({ error: 'Payment could not be verified. No fulfillment was approved.' }, 503); }
}
