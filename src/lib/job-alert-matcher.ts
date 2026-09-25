import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, BASE_URL } from '@/lib/email';
import type { AlertCriteria } from '@/lib/job-alert-criteria';

interface AlertRow extends AlertCriteria { id: string; seeker_id: string }

/** Run after publication. A seeker scope supports targeted recovery without a broadcast.
 * Callers must use Next.js after() or await this; never fire and forget on serverless.
 * Failed sends remain unlogged so an operator can safely retry them.
 */
export async function processJobAlerts(jobId: string, scope?: { seekerId: string }) {
  const result = { sent: 0, failed: 0, messageIds: [] as string[] };
  try {
    const db = createAdminClient();
    const { data: job, error: jobError } = await db.from('job_listings')
      .select('id, title, description, category, job_type, status, expires_at, companies(company_name)')
      .eq('id', jobId).single();
    if (jobError) throw jobError;
    if (!job || job.status !== 'active' || (job.expires_at && new Date(job.expires_at).getTime() <= Date.now())) return result;

    const company = Array.isArray(job.companies) ? job.companies[0] : job.companies;
    const text = `${job.title} ${job.description || ''}`.toLowerCase();
    const matches: AlertRow[] = [];
    // Do not silently stop at the Data API's default row limit.
    for (let offset = 0; ; offset += 500) {
      let query = db.from('job_alerts').select('id, seeker_id, keywords, industry, job_type').order('id').range(offset, offset + 499);
      if (scope) query = query.eq('seeker_id', scope.seekerId);
      const { data: alerts, error } = await query;
      if (error) throw error;
      for (const alert of (alerts || []) as AlertRow[]) {
        const words = (alert.keywords || []).map(word => word.trim().toLowerCase()).filter(Boolean);
        if (!words.length && !alert.industry && !alert.job_type) continue;
        if (words.length && !words.some(word => text.includes(word))) continue;
        if (alert.industry && alert.industry !== job.category) continue;
        if (alert.job_type && alert.job_type !== job.job_type) continue;
        matches.push(alert);
      }
      if (!alerts || alerts.length < 500) break;
    }

    const groups = new Map<string, AlertRow[]>();
    for (const alert of matches) groups.set(alert.seeker_id, [...(groups.get(alert.seeker_id) || []), alert]);
    for (const [seekerId, alerts] of groups) {
      try {
        const { data: logs, error: logError } = await db.from('job_alert_log').select('alert_id').eq('job_id', jobId).in('alert_id', alerts.map(alert => alert.id));
        if (logError) throw logError;
        // A person with overlapping alerts receives one email for this job.
        if (logs?.length) continue;
        const { data: profile, error: profileError } = await db.from('seeker_profiles').select('user_id').eq('id', seekerId).maybeSingle();
        if (profileError) throw profileError;
        if (!profile) continue;
        const { data: user, error: userError } = await db.from('users').select('email, email_verified, is_banned').eq('id', profile.user_id).maybeSingle();
        if (userError) throw userError;
        if (!user?.email || user.email_verified !== true || user.is_banned) continue;

        const sent = await sendEmail({ to: user.email, type: 'job_alert',
          idempotencyKey: `job-alert/${jobId}/${seekerId}`,
          data: { jobs: [{ title: job.title, company: company?.company_name || 'An employer', url: `${BASE_URL}/jobs/${job.id}` }] },
        });
        if (!sent.success) { result.failed++; continue; }
        result.sent++; result.messageIds.push(sent.id);
        const { error: writeError } = await db.from('job_alert_log').upsert(alerts.map(alert => ({ alert_id: alert.id, job_id: jobId })), { onConflict: 'alert_id,job_id', ignoreDuplicates: true });
        if (writeError) throw writeError;
      } catch (error) { result.failed++; console.error('[processJobAlerts] Recipient processing failed:', error); }
    }
  } catch (error) { result.failed++; console.error('[processJobAlerts] Failed:', error); }
  return result;
}
