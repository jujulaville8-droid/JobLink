import { createAdminClient } from '@/lib/supabase/admin';
import { createResumeOrderSchema, writingOrderFields } from '@/lib/resume-writing';
import { writingBody, writingConfig, writingJson, writingLimit, writingOwner } from '@/lib/resume-writing-server';
import { resumeWritingPolicy } from '@/lib/resume-writing-stripe';

export async function GET() {
  try {
    const auth = await writingOwner(); if ('error' in auth) return auth.error;
    const config = writingConfig();
    if (process.env.RESUME_WRITING_ENABLED !== 'true') return writingJson({ config, orders: [] });
    const result = await createAdminClient().from('resume_writing_orders').select(writingOrderFields)
      .eq('user_id', auth.user.id).eq('payment_policy',resumeWritingPolicy().key).order('created_at', { ascending: false }).limit(10);
    if (result.error) return writingJson({ error: 'Could not load saved requests.' }, 503);
    return writingJson({ config, orders: result.data });
  } catch { return writingJson({ error: 'Could not load saved requests.' }, 503); }
}
export async function POST(request: Request) {
  try {
    const auth = await writingOwner(); if ('error' in auth) return auth.error;
    const config = writingConfig();
    if (!config.intakeEnabled || !config.terms) return writingJson({ error: 'Requests are unavailable until service terms are confirmed.' }, 503);
    const parsed = createResumeOrderSchema.safeParse(await writingBody(request));
    if (!parsed.success) return writingJson({ error: 'Check your details and consent.' }, 400);
    if (parsed.data.termsVersion !== config.terms.version) return writingJson({ error: 'Service terms changed. Reload and review them before saving.' }, 409);
    const limited = await writingLimit(auth.user.id); if (limited) return limited;
    const result = await createAdminClient().rpc('create_resume_writing_order', {
      p_id: parsed.data.id, p_user_id: auth.user.id, p_intake: parsed.data.intake, p_terms: config.terms, p_payment_policy:resumeWritingPolicy().key,
    });
    if (result.error || !result.data) return writingJson({ error: 'Could not save this request. Keep your draft; retry the same request or reload if it changed.' }, 409);
    return writingJson({ order: result.data }, 201);
  } catch { return writingJson({ error: 'Could not save your request. Your local draft is still here.' }, 400); }
}
