import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, BASE_URL } from '@/lib/email'

interface AlertRow {
  id: string
  seeker_id: string
  keywords: string[] | null
  industry: string | null
  job_type: string | null
}

/**
 * Matches a newly-activated job against all job alerts and sends
 * emails to seekers whose alerts match. Fire-and-forget — never throws.
 */
export async function processJobAlerts(jobId: string): Promise<void> {
  try {
    const db = createAdminClient()

    // Fetch the job with company name
    const { data: job, error: jobErr } = await db
      .from('job_listings')
      .select('id, title, description, category, job_type, companies(company_name)')
      .eq('id', jobId)
      .single()

    if (jobErr || !job) {
      console.error('[processJobAlerts] Job not found:', jobId, jobErr?.message)
      return
    }

    const companyInfo = Array.isArray(job.companies) ? job.companies[0] : job.companies
    const companyName = companyInfo?.company_name || 'Unknown Company'
    const searchText = `${job.title} ${job.description || ''}`.toLowerCase()

    // Fetch all alerts
    const { data: alerts, error: alertErr } = await db
      .from('job_alerts')
      .select('id, seeker_id, keywords, industry, job_type')

    if (alertErr || !alerts || alerts.length === 0) return

    // Match alerts against the job
    const matchingAlerts: AlertRow[] = alerts.filter((alert: AlertRow) => {
      // Keywords: ANY keyword must appear in title+description
      if (alert.keywords && alert.keywords.length > 0) {
        const hasKeyword = alert.keywords.some((kw) =>
          searchText.includes(kw.toLowerCase())
        )
        if (!hasKeyword) return false
      }

      // Industry: exact match on category
      if (alert.industry && alert.industry !== job.category) return false

      // Job type: exact match
      if (alert.job_type && alert.job_type !== job.job_type) return false

      return true
    })

    if (matchingAlerts.length === 0) return

    // Check which alert+job pairs have already been sent
    const alertIds = matchingAlerts.map((a) => a.id)
    const { data: alreadySent } = await db
      .from('job_alert_log')
      .select('alert_id')
      .eq('job_id', jobId)
      .in('alert_id', alertIds)

    const sentSet = new Set((alreadySent || []).map((r: { alert_id: string }) => r.alert_id))
    const unsent = matchingAlerts.filter((a) => !sentSet.has(a.id))

    if (unsent.length === 0) return

    // Group by seeker_id (one email per seeker)
    const seekerAlertMap = new Map<string, string[]>()
    for (const alert of unsent) {
      const existing = seekerAlertMap.get(alert.seeker_id) || []
      existing.push(alert.id)
      seekerAlertMap.set(alert.seeker_id, existing)
    }

    // Get seeker emails
    const seekerIds = Array.from(seekerAlertMap.keys())
    const { data: seekerProfiles } = await db
      .from('seeker_profiles')
      .select('id, user_id')
      .in('id', seekerIds)

    if (!seekerProfiles || seekerProfiles.length === 0) return

    const userIds = seekerProfiles.map((p: { user_id: string }) => p.user_id)
    const { data: users } = await db
      .from('users')
      .select('id, email')
      .in('id', userIds)

    if (!users || users.length === 0) return

    const userEmailMap = new Map<string, string>()
    for (const u of users) {
      if (u.email) userEmailMap.set(u.id, u.email)
    }

    const seekerUserMap = new Map<string, string>()
    for (const p of seekerProfiles) {
      seekerUserMap.set(p.id, p.user_id)
    }

    // Send emails and log
    const jobUrl = `${BASE_URL}/jobs/${job.id}`
    const logInserts: { alert_id: string; job_id: string }[] = []

    for (const [seekerId, alertIdList] of seekerAlertMap) {
      const userId = seekerUserMap.get(seekerId)
      if (!userId) continue
      const email = userEmailMap.get(userId)
      if (!email) continue

      sendEmail({
        to: email,
        type: 'job_alert',
        data: {
          jobs: [{ title: job.title, company: companyName, url: jobUrl }],
        },
      })

      for (const alertId of alertIdList) {
        logInserts.push({ alert_id: alertId, job_id: jobId })
      }
    }

    // Log sent alerts (ignore conflicts for dedup safety)
    if (logInserts.length > 0) {
      await db
        .from('job_alert_log')
        .upsert(logInserts, { onConflict: 'alert_id,job_id', ignoreDuplicates: true })
    }

    console.log(
      `[processJobAlerts] Job ${jobId}: matched ${unsent.length} alerts, emailed ${seekerAlertMap.size} seekers`
    )
  } catch (err) {
    console.error('[processJobAlerts] Error:', err)
  }
}
