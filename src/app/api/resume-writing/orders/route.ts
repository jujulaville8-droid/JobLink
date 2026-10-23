import { createAdminClient } from '@/lib/supabase/admin';
import { writingOrderFields, writingFileFields } from '@/lib/resume-writing';
import { writingConfig, writingJson, writingOwner, writingSameOrigin } from '@/lib/resume-writing-server';
import { resumeWritingPolicy } from '@/lib/resume-writing-stripe';

export async function GET() {
  try {
    const auth = await writingOwner(); if ('error' in auth) return auth.error;
    const config = writingConfig();
    if (process.env.RESUME_WRITING_ENABLED !== 'true') return writingJson({ config, orders: [] });
    const result = await createAdminClient().from('resume_writing_orders').select(writingOrderFields)
      .eq('user_id', auth.user.id).eq('payment_policy',resumeWritingPolicy().key).order('created_at', { ascending: false }).limit(10);
    if (result.error) return writingJson({ error: 'Could not load saved requests.' }, 503);
    const orders = result.data ?? [];
    if (!orders.length) return writingJson({ config, orders });
    const files = await createAdminClient().from('resume_writing_files').select(`${writingFileFields},order_id`).in('order_id',orders.map(o=>o.id)).not('published_at','is',null);
    if (files.error) return writingJson({ error:'Could not load your documents.' },503);
    return writingJson({ config, orders:orders.map(o=>({...o,files:(files.data??[]).filter(f=>f.order_id===o.id&&f.revision_number===o.revision_count).map(f=>({id:f.id,kind:f.kind,revision_number:f.revision_number,published_at:f.published_at}))})) });
  } catch { return writingJson({ error: 'Could not load saved requests.' }, 503); }
}
// Preserve existing order reads and fulfillment, but never create new paid-service intake.
export async function POST(request: Request) {
  const auth = await writingOwner(); if ('error' in auth) return auth.error;
  if (!writingSameOrigin(request)) return writingJson({ error: 'Use the JobLink consultation page.' }, 403);
  return writingJson({ error: 'New résumé orders have been retired. Book a consultation instead.' }, 410);
}
