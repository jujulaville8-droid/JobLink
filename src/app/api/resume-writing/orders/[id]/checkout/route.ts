import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResumeWritingStripe, resumeWritingPolicy } from '@/lib/resume-writing-stripe';
import { verifiedResumeCheckoutUrl } from '@/lib/resume-writing-payment';
import { writingConfig, writingJson, writingLimit, writingOwner, writingSameOrigin } from '@/lib/resume-writing-server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await writingOwner(); if ('error' in auth) return auth.error;
    if (!writingSameOrigin(request)) return writingJson({ error: 'Use the JobLink request page.' }, 403);
    const config = writingConfig(); if (!config.checkoutEnabled || !config.terms) return writingJson({ error: 'Checkout is not available.' }, 503);
    const { id } = await params; if (!z.uuid().safeParse(id).success) return writingJson({ error: 'Request not found.' }, 404);
    const limited = await writingLimit(auth.user.id); if (limited) return limited;
    const policy=resumeWritingPolicy();
    const result = await createAdminClient().from('resume_writing_orders').select('checkout_reference,payment_status,terms')
      .eq('id', id).eq('user_id', auth.user.id).eq('payment_policy',policy.key).maybeSingle();
    if (result.error) return writingJson({ error: 'Could not load your request.' }, 503);
    if (!result.data) return writingJson({ error: 'Request not found.' }, 404);
    if (result.data.payment_status !== 'unpaid' || result.data.terms?.version !== config.terms.version) return writingJson({ error: 'Review your request status and current terms before paying.' }, 409);
    const url = await verifiedResumeCheckoutUrl(getResumeWritingStripe(), result.data.checkout_reference);
    return writingJson({ url, mode:policy.mode });
  } catch { return writingJson({ error: 'Checkout is unavailable. Your saved request is safe.' }, 503); }
}
