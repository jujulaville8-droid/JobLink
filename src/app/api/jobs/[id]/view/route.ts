import { createHmac } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/rate-limit';
import { getJobClosure } from '@/lib/job-closures';
import { jobViewsLaunch } from '@/lib/job-views-config';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ignored = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

/** Bound the streamed body too: Content-Length alone is untrusted. */
async function smallJson(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const now = new Date();
    if (!jobViewsLaunch(now)) return ignored();
    const { id } = await params;
    if (!uuid.test(id) || request.headers.get('origin') !== new URL(request.url).origin ||
      !request.headers.get('content-type')?.startsWith('application/json') ||
      Number(request.headers.get('content-length') ?? 0) > 256) return ignored();
    const payload = await smallJson(request);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ignored();
    const body = payload as Record<string, unknown>;
    if (Object.keys(body).some(key => key !== 'eventId' && key !== 'surface') ||
      typeof body.eventId !== 'string' || !uuid.test(body.eventId) ||
      typeof body.surface !== 'string' || !['job_page', 'job_pane'].includes(body.surface)) return ignored();
    const secret = process.env.JOB_VIEWS_RATE_LIMIT_SECRET;
    if (!secret) return ignored();
    const admin = createAdminClient();
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    // Session client enforces the same public listing access as browsing.
    const listing = await db.from('job_listings').select('id,company_id,status').eq('id', id).eq('status', 'active').maybeSingle();
    if (listing.error || !listing.data || getJobClosure(id, listing.data.company_id, now)) return ignored();
    if (user) {
      const [identity, company] = await Promise.all([
        db.from('users').select('role,is_admin').eq('id', user.id).single(),
        db.from('companies').select('user_id').eq('id', listing.data.company_id).single(),
      ]);
      // Do not count authenticated previews if identity/ownership lookup failed.
      if (identity.error || company.error || !identity.data || !company.data ||
        identity.data.role === 'admin' || identity.data.is_admin === true || company.data.user_id === user.id) return ignored();
    }
    // A daily rotating keyed digest is only an expiring abuse bucket, never event data.
    const digest = createHmac('sha256', secret).update(`${now.toISOString().slice(0, 10)}:${clientIp(request)}`).digest('hex');
    const budget = await admin.rpc('consume_rate_limit', { p_bucket: `job-view:${digest}:${id}`, p_limit: 10, p_window_seconds: 3600 });
    const limit = Array.isArray(budget.data) ? budget.data[0] : budget.data;
    if (budget.error || limit?.allowed !== true) return ignored();
    const written = await admin.from('job_views').upsert({ event_id: body.eventId, job_id: id, surface: body.surface, viewed_at: now.toISOString() }, { onConflict: 'event_id', ignoreDuplicates: true });
    if (written.error) console.warn('[job-views] recording unavailable');
  } catch {
    // Telemetry must never affect browsing; do not log visitor identifiers or request bodies.
    console.warn('[job-views] recording unavailable');
  }
  return ignored();
}
