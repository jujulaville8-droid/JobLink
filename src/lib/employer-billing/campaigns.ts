import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { longDate } from '@/lib/verification/shared'

export const evidenceBucket = 'spotlight-evidence'

export interface CampaignRow {
  id: string
  credit_id: string
  company_id: string
  job_id: string
  status: 'requested' | 'scheduled' | 'live' | 'ended' | 'cancelled'
  requested_start: string
  starts_at: string | null
  ends_at: string | null
  ended_reason: string | null
  website_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  evidence_paths: string[]
  proof_sent_at: string | null
  edit_used_at: string | null
  day3_checked_at: string | null
  report_sent_at: string | null
  needs_review: boolean
  was_featured: boolean | null
  created_at: string
}

/** The private evidence folder; the server refuses it if it is ever made public. */
export async function evidenceStorage(db: SupabaseClient) {
  const result = await db.storage.getBucket(evidenceBucket)
  if (result.error || !result.data || result.data.public !== false) throw new Error('Evidence storage unavailable.')
  return db.storage.from(evidenceBucket)
}

/** Where the employer's emails go: the company contact address, else the verified owner. */
async function employerRecipient(db: SupabaseClient, companyId: string): Promise<{ email: string; company: string } | null> {
  const { data: company } = await db.from('companies').select('company_name, contact_email, user_id').eq('id', companyId).maybeSingle()
  if (!company) return null
  if (company.contact_email) return { email: company.contact_email, company: company.company_name }
  const { data: owner } = await db.from('users').select('email, email_verified').eq('id', company.user_id).maybeSingle()
  return owner?.email && owner.email_verified ? { email: owner.email, company: company.company_name } : null
}

async function jobTitle(db: SupabaseClient, jobId: string) {
  const { data } = await db.from('job_listings').select('title').eq('id', jobId).maybeSingle()
  return data?.title ?? 'your vacancy'
}

/**
 * Totals during the promotion: views recorded for the job (when view tracking
 * is on) and applications received, each counted separately and labelled by
 * source in the email. Never a hire count.
 */
export async function campaignStats(db: SupabaseClient, campaign: Pick<CampaignRow, 'job_id' | 'starts_at' | 'ends_at'>) {
  if (!campaign.starts_at || !campaign.ends_at) return { views: null as number | null, applications: 0 }
  const end = new Date(Math.min(Date.parse(campaign.ends_at), Date.now())).toISOString()
  const [views, applications] = await Promise.all([
    process.env.JOB_VIEWS_LAUNCH_AT
      ? db.from('job_views').select('event_id', { count: 'exact', head: true }).eq('job_id', campaign.job_id).gte('viewed_at', campaign.starts_at).lt('viewed_at', end)
      : Promise.resolve({ count: null, error: null }),
    db.from('applications').select('id', { count: 'exact', head: true }).eq('job_id', campaign.job_id).gte('applied_at', campaign.starts_at).lt('applied_at', end),
  ])
  return { views: views.error ? null : views.count ?? null, applications: applications.count ?? 0 }
}

/** Email the employer the three live placements, with screenshots attached. */
export async function sendCampaignProof(db: SupabaseClient, campaign: CampaignRow): Promise<boolean> {
  if (!campaign.website_url || !campaign.facebook_url || !campaign.instagram_url || !campaign.ends_at) return false
  const recipient = await employerRecipient(db, campaign.company_id)
  if (!recipient) return false
  const attachments: { filename: string; content: Buffer; contentType: string }[] = []
  if (campaign.evidence_paths.length) {
    const storage = await evidenceStorage(db)
    for (const [index, path] of campaign.evidence_paths.entries()) {
      const file = await storage.download(path)
      if (file.data) attachments.push({ filename: `spotlight-${index + 1}.${path.split('.').pop()}`, content: Buffer.from(await file.data.arrayBuffer()), contentType: file.data.type || 'image/png' })
    }
  }
  const result = await sendEmail({
    to: recipient.email, type: 'spotlight_live', attachments,
    idempotencyKey: `spotlight/${campaign.id}/proof`,
    data: {
      company_name: recipient.company, job_title: await jobTitle(db, campaign.job_id),
      spotlight_ends: longDate(campaign.ends_at),
      spotlight_links: [
        { label: 'Featured on JobLink', url: campaign.website_url },
        { label: 'Facebook post', url: campaign.facebook_url },
        { label: 'Instagram post', url: campaign.instagram_url },
      ],
    },
  })
  if (result.success) await db.from('spotlight_campaigns').update({ proof_sent_at: new Date().toISOString() }).eq('id', campaign.id)
  return result.success
}

/** The day-seven (or early-closure) results email. */
export async function sendCampaignReport(db: SupabaseClient, campaign: CampaignRow): Promise<boolean> {
  const recipient = await employerRecipient(db, campaign.company_id)
  if (!recipient || !campaign.starts_at) return false
  const stats = await campaignStats(db, campaign)
  const result = await sendEmail({
    to: recipient.email, type: campaign.ended_reason === 'job_closed' ? 'spotlight_closed_early' : 'spotlight_report',
    idempotencyKey: `spotlight/${campaign.id}/report`,
    data: {
      company_name: recipient.company, job_title: await jobTitle(db, campaign.job_id),
      spotlight_started: longDate(campaign.starts_at), spotlight_ends: campaign.ends_at ? longDate(campaign.ends_at) : '',
      spotlight_views: stats.views, spotlight_applications: stats.applications,
      review_path: `/my-listings/${campaign.job_id}/applicants`,
    },
  })
  if (result.success) await db.from('spotlight_campaigns').update({ report_sent_at: new Date().toISOString() }).eq('id', campaign.id)
  return result.success
}

/**
 * Due work for live campaigns: end any past 168 hours, end any whose vacancy
 * has closed, and send each report once. Each campaign on its own, so one
 * failure never blocks the rest; every step is safe to repeat.
 */
export async function runSpotlightSchedule(db: SupabaseClient) {
  const result = { ended: 0, closed_early: 0, reports: 0, failed: 0 }
  const { data: live, error } = await db.from('spotlight_campaigns').select('*').eq('status', 'live').limit(500)
  if (error) return { ...result, failed: 1 }
  for (const campaign of (live ?? []) as CampaignRow[]) {
    try {
      const { data: job } = await db.from('job_listings').select('status').eq('id', campaign.job_id).maybeSingle()
      const reason = job?.status !== 'active' ? 'job_closed' : campaign.ends_at && Date.parse(campaign.ends_at) <= Date.now() ? 'completed' : null
      if (!reason) continue
      const { error: endError } = await db.rpc('end_spotlight_campaign', { p_campaign_id: campaign.id, p_reason: reason })
      if (endError) { result.failed++; continue }
      if (reason === 'job_closed') result.closed_early++
      else result.ended++
    } catch { result.failed++ }
  }
  const { data: unreported } = await db.from('spotlight_campaigns').select('*').eq('status', 'ended').is('report_sent_at', null)
    .not('starts_at', 'is', null).in('ended_reason', ['completed', 'job_closed']).limit(200)
  for (const campaign of (unreported ?? []) as CampaignRow[]) {
    try { if (await sendCampaignReport(db, campaign)) result.reports++ } catch { result.failed++ }
  }
  return result
}
