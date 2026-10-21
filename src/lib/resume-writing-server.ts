import 'server-only';
import { z } from 'zod';
import { requireVerifiedUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { WritingConfig } from '@/lib/resume-writing';
import { resumeWritingPolicy } from '@/lib/resume-writing-stripe';

export const writingJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export function writingConfig(): WritingConfig {
  const parsed = z.object({ version: z.string().trim().min(1).max(100), delivery: z.string().trim().min(1).max(3000),
    revision: z.string().trim().min(1).max(3000), refund: z.string().trim().min(1).max(3000), privacy: z.string().trim().min(1).max(3000) }).refine(value=>new TextEncoder().encode(JSON.stringify(value)).length<=14000).safeParse({
    version: process.env.RESUME_WRITING_TERMS_VERSION, delivery: process.env.RESUME_WRITING_DELIVERY_TERMS,
    revision: process.env.RESUME_WRITING_REVISION_TERMS, refund: process.env.RESUME_WRITING_REFUND_TERMS,
    privacy: process.env.RESUME_WRITING_PRIVACY_TERMS,
  });
  let paymentMode:'sandbox'|'live'|null=null;
  try { paymentMode=resumeWritingPolicy().mode; } catch { /* Missing policy fails closed. */ }
  const intakeEnabled = process.env.RESUME_WRITING_ENABLED === 'true' && parsed.success && paymentMode!==null;
  return { intakeEnabled, checkoutEnabled: false, terms: parsed.success ? parsed.data : null, paymentMode };
}
export async function writingOwner() {
  const auth = await requireVerifiedUser();
  if ('error' in auth) return auth;
  const role = await auth.supabase.from('users').select('role').eq('id', auth.user.id).single();
  if (role.error) return { error: writingJson({ error: 'Could not verify account.' }, 503) };
  if (role.data?.role !== 'seeker') return { error: writingJson({ error: 'A verified job-seeker account is required.' }, 403) };
  return auth;
}
export function writingSameOrigin(request: Request) {
  const url = new URL(request.url); const host = request.headers.get('host') ?? url.host;
  const protocol = request.headers.get('x-forwarded-proto') ?? url.protocol.slice(0,-1);
  return ['http','https'].includes(protocol) && request.headers.get('origin') === `${protocol}://${host}`;
}
export async function writingBody(request: Request): Promise<unknown> {
  if (!writingSameOrigin(request) || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('invalid_request');
  if (Number(request.headers.get('content-length')) > 24000) throw new Error('invalid_request');
  const reader = request.body?.getReader(); if (!reader) throw new Error('invalid_request');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength;
      if (size > 24000) { await reader.cancel(); throw new Error('invalid_request'); } chunks.push(item.value); }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function writingLimit(userId: string) {
  const { data, error } = await createAdminClient().rpc('consume_rate_limit', { p_bucket: `resume-writing:${userId}`, p_limit: 10, p_window_seconds: 3600 });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || typeof row?.allowed !== 'boolean') return writingJson({ error: 'Requests are temporarily unavailable.' }, 503);
  if (!row.allowed) return writingJson({ error: 'Too many requests. Try again later.' }, 429);
  return null;
}
