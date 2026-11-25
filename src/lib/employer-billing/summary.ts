import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { companyEntitlement, directoryGated } from './entitlement'
import { claimableOrders } from './orders'
import { employerSalesOpen } from './config'

export interface EmployerBillingSummary {
  salesOpen: boolean
  directoryGated: boolean
  pro: { active: boolean; source: 'paid' | 'grant' | null; paidThrough: string | null; status: string | null; cancelAtPeriodEnd: boolean; manageable: boolean }
  credits: { id: string; source: string; expires_at: string | null; created_at: string }[]
  campaigns: { id: string; job_id: string; job_title: string; status: string; requested_start: string; starts_at: string | null; ends_at: string | null; ended_reason: string | null }[]
  jobs: { id: string; title: string; booked: boolean }[]
  claimable: { id: string; offer: string; amount: number | null; paid_at: string | null }[]
}

/** Everything the employer billing page shows. Read with the service role after the caller is authorised. */
export async function employerBillingSummary(db: SupabaseClient, companyId: string, email: string | null): Promise<EmployerBillingSummary> {
  const [entitlement, gated, subscription, credits, campaigns, jobs, claimable] = await Promise.all([
    companyEntitlement(db, companyId),
    directoryGated(db),
    db.from('employer_pro_subscriptions').select('status, cancel_at_period_end, stripe_customer_id').eq('company_id', companyId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('spotlight_credits').select('id, source, expires_at, created_at').eq('company_id', companyId).eq('status', 'available')
      .order('created_at', { ascending: true }),
    db.from('spotlight_campaigns').select('id, job_id, status, requested_start, starts_at, ends_at, ended_reason, job_listings(title)')
      .eq('company_id', companyId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(20),
    db.from('job_listings').select('id, title').eq('company_id', companyId).eq('status', 'active').order('created_at', { ascending: false }),
    claimableOrders(db, email),
  ])
  const now = Date.now()
  const liveCredits = (credits.data ?? []).filter((credit) => !credit.expires_at || Date.parse(credit.expires_at) > now)
  const campaignRows = (campaigns.data ?? []).map((row) => {
    const job = Array.isArray(row.job_listings) ? row.job_listings[0] : row.job_listings
    return { id: row.id, job_id: row.job_id, job_title: (job as { title?: string } | null)?.title ?? 'Vacancy', status: row.status,
      requested_start: row.requested_start, starts_at: row.starts_at, ends_at: row.ends_at, ended_reason: row.ended_reason }
  })
  const busy = new Set(campaignRows.filter((row) => ['requested', 'scheduled', 'live'].includes(row.status)).map((row) => row.job_id))
  return {
    salesOpen: employerSalesOpen(),
    directoryGated: gated,
    pro: {
      active: entitlement.pro, source: entitlement.source, paidThrough: entitlement.paidThrough,
      status: subscription.data?.status ?? null, cancelAtPeriodEnd: subscription.data?.cancel_at_period_end === true,
      manageable: !!subscription.data?.stripe_customer_id,
    },
    credits: liveCredits,
    campaigns: campaignRows,
    jobs: (jobs.data ?? []).map((job) => ({ id: job.id, title: job.title, booked: busy.has(job.id) })),
    claimable: claimable.map((order) => ({ id: order.id, offer: order.offer, amount: order.amount, paid_at: order.paid_at })),
  }
}
