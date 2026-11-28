import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { companyEntitlement } from './entitlement'
import { employerBillingConfig, type EmployerOffer } from './config'

export class PurchaseRefused extends Error {
  constructor(public code: 'NO_COMPANY' | 'JOB_NOT_ELIGIBLE' | 'ALREADY_PRO' | 'UNAVAILABLE' | 'SPOTLIGHT_BOOKED', message: string) { super(message) }
}

/**
 * The JobLink start page for a purchase: records an order bound to this
 * company (and, for a Spotlight, the vacancy) and returns the issued Payment
 * Link with the order's random reference attached, so the payment can be
 * matched without trusting anything typed at checkout.
 */
export async function startEmployerPurchase(db: SupabaseClient, input: {
  userId: string; email: string | null; offer: EmployerOffer; jobId?: string | null
}): Promise<{ url: string; orderId: string }> {
  const config = employerBillingConfig()
  if (!config) throw new PurchaseRefused('UNAVAILABLE', 'Payments are not available right now.')
  const { data: company } = await db.from('companies').select('id').eq('user_id', input.userId).maybeSingle()
  if (!company) throw new PurchaseRefused('NO_COMPANY', 'Set up your company profile first.')

  let jobId: string | null = null
  if (input.offer === 'spotlight' && input.jobId) {
    const { data: job } = await db.from('job_listings').select('id').eq('id', input.jobId).eq('company_id', company.id).eq('status', 'active').maybeSingle()
    if (!job) throw new PurchaseRefused('JOB_NOT_ELIGIBLE', 'Choose one of your live vacancies.')
    const { data: booked } = await db.from('spotlight_campaigns').select('id').eq('job_id', job.id).in('status', ['requested', 'scheduled', 'live']).limit(1)
    if (booked?.length) throw new PurchaseRefused('SPOTLIGHT_BOOKED', 'This vacancy already has a Spotlight booked or running.')
    jobId = job.id
  }
  if (input.offer === 'pro') {
    const entitlement = await companyEntitlement(db, company.id)
    if (entitlement.source === 'paid') throw new PurchaseRefused('ALREADY_PRO', 'You already have Employer Pro.')
    const { data: live } = await db.from('employer_pro_subscriptions').select('stripe_subscription_id')
      .eq('company_id', company.id).in('status', ['active', 'trialing', 'past_due']).limit(1)
    if (live?.length) throw new PurchaseRefused('ALREADY_PRO', 'You already have an Employer Pro subscription.')
  }

  const { data: order, error } = await db.from('employer_orders')
    .insert({ offer: input.offer, company_id: company.id, purchaser_id: input.userId, job_id: jobId, livemode: config.livemode })
    .select('id, reference').single()
  if (error || !order) throw new Error('Could not start the order')

  const link = new URL((input.offer === 'spotlight' ? config.spotlight : config.pro).linkUrl)
  link.searchParams.set('client_reference_id', order.reference)
  if (input.email) link.searchParams.set('prefilled_email', input.email)
  return { url: link.toString(), orderId: order.id }
}

/**
 * Paid orders without a company that look like this employer's: the Stripe
 * receipt email matches their verified account email. Staff resolve anything else.
 */
export async function claimableOrders(db: SupabaseClient, email: string | null | undefined) {
  if (!email) return []
  const { data } = await db.from('employer_orders').select('id, offer, amount, paid_at, customer_email')
    .is('company_id', null).eq('status', 'paid').ilike('customer_email', email.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(10)
  return (data ?? []).filter((row) => row.customer_email?.toLowerCase() === email.toLowerCase())
}
