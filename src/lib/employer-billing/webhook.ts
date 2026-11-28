import 'server-only'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ownerAlert } from '@/lib/verification/server'
import { EMPLOYER_CURRENCY, PRO_AMOUNT, SPOTLIGHT_AMOUNT, employerBillingConfig, employerBillingEnabled, offerFor, type EmployerBillingConfig } from './config'

export type BillingOutcome = { handled: false } | { handled: true; outcome: string }
const skip: BillingOutcome = { handled: false }
const done = (outcome: string): BillingOutcome => ({ handled: true, outcome })

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === 'string' ? value : value?.id ?? null)

async function rpc<T = Record<string, unknown>>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data as T
}

/** Record an event we recognise but deliberately do nothing with, so a replay is a no-op. */
async function noteOnly(db: SupabaseClient, event: Stripe.Event, outcome: string): Promise<BillingOutcome> {
  await rpc(db, 'claim_employer_billing_event', { p_event_id: event.id, p_event_type: event.type })
  await db.from('employer_billing_events').update({ outcome }).eq('event_id', event.id)
  return done(outcome)
}

async function sessionOffer(stripe: Stripe, config: EmployerBillingConfig, session: Stripe.Checkout.Session) {
  const linkId = idOf(session.payment_link)
  // Payment Link alone is not trusted: the line items must carry the offer's price.
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 })
  const priceIds = items.data.flatMap((item) => (item.price?.id ? [item.price.id] : []))
  const byPrice = offerFor(config, { priceIds })
  const byLink = linkId ? offerFor(config, { linkId }) : null
  if (!byPrice) return { offer: byLink, priceIds, mismatch: !!byLink }
  if (byLink && byLink !== byPrice) return { offer: byPrice, priceIds, mismatch: true }
  return { offer: byPrice, priceIds, mismatch: false }
}

async function handleSession(stripe: Stripe, db: SupabaseClient, config: EmployerBillingConfig, event: Stripe.Event): Promise<BillingOutcome> {
  const session = event.data.object as Stripe.Checkout.Session
  // Cheap pre-filter: only sessions from our links or with no link at all are inspected.
  const linkId = idOf(session.payment_link)
  if (linkId && linkId !== config.spotlight.linkId && linkId !== config.pro.linkId) return skip
  if (!linkId && session.metadata?.purchase_type) return skip // Verified, Smart Resume and the legacy Pro checkout tag theirs.
  const { offer, mismatch } = await sessionOffer(stripe, config, session)
  if (!offer) return skip
  if (mismatch) {
    await ownerAlert('JobLink employer payment needs a look', 'A Spotlight or Pro checkout did not match its expected link and price. Check Stripe before granting anything.')
    return noteOnly(db, event, 'price_mismatch')
  }

  const reference = session.client_reference_id ?? null
  const email = session.customer_details?.email ?? null
  const customer = idOf(session.customer)

  if (offer === 'spotlight') {
    if (event.type === 'checkout.session.async_payment_failed') return noteOnly(db, event, 'payment_failed')
    if (session.mode !== 'payment') return noteOnly(db, event, 'wrong_mode')
    // Card payments settle at completion; delayed methods settle later with async_payment_succeeded.
    if (session.payment_status !== 'paid') return noteOnly(db, event, 'awaiting_funds')
    if (session.amount_total !== SPOTLIGHT_AMOUNT || session.currency?.toLowerCase() !== EMPLOYER_CURRENCY) {
      await ownerAlert('JobLink Spotlight payment needs a look', 'A Spotlight payment had an unexpected amount or currency. No credit was issued.')
      return noteOnly(db, event, 'amount_mismatch')
    }
    const result = await rpc<{ outcome: string }>(db, 'record_spotlight_payment', {
      p_event_id: event.id, p_event_type: event.type, p_session_id: session.id, p_reference: reference,
      p_payment_intent: idOf(session.payment_intent), p_customer_id: customer, p_customer_email: email,
      p_amount: session.amount_total, p_currency: session.currency?.toLowerCase(), p_livemode: event.livemode,
    })
    if (result.outcome === 'unassigned') {
      await ownerAlert('JobLink Spotlight paid: needs matching', 'A Spotlight was paid without a JobLink order reference. Match it to a company in Admin > Employer billing.')
    } else if (result.outcome === 'applied') {
      await ownerAlert('JobLink Spotlight paid', 'A Spotlight has been paid. Confirm the vacancy and dates with the employer, then schedule it in Admin > Employer billing.')
    }
    return done(result.outcome)
  }

  if (event.type !== 'checkout.session.completed') return noteOnly(db, event, 'ignored')
  const subscription = idOf(session.subscription)
  if (session.mode !== 'subscription' || !subscription) return noteOnly(db, event, 'wrong_mode')
  const result = await rpc<{ outcome: string; duplicateSubscription?: boolean }>(db, 'record_pro_checkout', {
    p_event_id: event.id, p_event_type: event.type, p_session_id: session.id, p_reference: reference,
    p_subscription_id: subscription, p_customer_id: customer, p_customer_email: email, p_livemode: event.livemode,
  })
  if (result.outcome === 'unassigned' || result.duplicateSubscription) {
    await ownerAlert('JobLink Pro subscription needs a look', result.duplicateSubscription
      ? 'A company that already has Pro started a second subscription. Review it in Admin > Employer billing.'
      : 'A Pro subscription was started without a JobLink order reference. Match it to a company in Admin > Employer billing.')
  }
  return done(result.outcome)
}

async function handleInvoice(stripe: Stripe, db: SupabaseClient, config: EmployerBillingConfig, event: Stripe.Event): Promise<BillingOutcome> {
  const invoice = event.data.object as Stripe.Invoice
  const subscription = idOf(invoice.parent?.subscription_details?.subscription ?? null)
  if (!subscription) return skip
  const lines = invoice.lines?.data ?? []
  const priceIds = lines.flatMap((line) => {
    const price = line.pricing?.price_details?.price
    return price ? [idOf(price) as string] : []
  })
  const ours = offerFor(config, { priceIds }) === 'pro'
    || !!(await db.from('employer_pro_subscriptions').select('stripe_subscription_id').eq('stripe_subscription_id', subscription).maybeSingle()).data
  if (!ours) return skip

  // invoice.payment_succeeded arrives alongside invoice.paid; one of them is enough.
  if (event.type !== 'invoice.paid') return noteOnly(db, event, 'ignored')
  if (!['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason ?? '')) return noteOnly(db, event, 'not_a_billing_month')
  if (invoice.amount_paid !== PRO_AMOUNT || invoice.currency?.toLowerCase() !== EMPLOYER_CURRENCY) {
    await ownerAlert('JobLink Pro invoice needs a look', 'A Pro invoice had an unexpected amount. No month or credit was issued.')
    return noteOnly(db, event, 'amount_mismatch')
  }
  const line = lines.find((item) => idOf(item.pricing?.price_details?.price ?? null) === config.pro.priceId) ?? lines[0]
  if (!line?.period?.start || !line.period.end) return noteOnly(db, event, 'no_period')

  // The payment intent links later refunds and disputes back to this month.
  let paymentIntent: string | null = null
  try {
    const full = await stripe.invoices.retrieve(invoice.id!, { expand: ['payments'] })
    paymentIntent = idOf(full.payments?.data?.find((item) => item.status === 'paid')?.payment?.payment_intent ?? null)
  } catch { /* A month without a payment link is still a paid month. */ }

  const result = await rpc<{ outcome: string }>(db, 'record_pro_invoice', {
    p_event_id: event.id, p_event_type: event.type, p_invoice_id: invoice.id, p_subscription_id: subscription,
    p_payment_intent: paymentIntent, p_customer_id: idOf(invoice.customer),
    p_period_start: new Date(line.period.start * 1000).toISOString(), p_period_end: new Date(line.period.end * 1000).toISOString(),
    p_amount: invoice.amount_paid, p_currency: invoice.currency?.toLowerCase(), p_livemode: event.livemode,
  })
  return done(result.outcome)
}

async function handleSubscription(db: SupabaseClient, config: EmployerBillingConfig, event: Stripe.Event): Promise<BillingOutcome> {
  const subscription = event.data.object as Stripe.Subscription
  const known = (await db.from('employer_pro_subscriptions').select('stripe_subscription_id').eq('stripe_subscription_id', subscription.id).maybeSingle()).data
  const priceIds = subscription.items?.data?.flatMap((item) => (item.price?.id ? [item.price.id] : [])) ?? []
  if (!known && offerFor(config, { priceIds }) !== 'pro') return skip
  const claimed = await rpc<boolean>(db, 'claim_employer_billing_event', { p_event_id: event.id, p_event_type: event.type })
  if (!claimed) return done('duplicate')
  // Status and cancellation are shown on the billing panel. Access itself comes
  // only from settled months, so a cancellation keeps access to the paid-through date.
  const update = { status: subscription.status, cancel_at_period_end: subscription.cancel_at_period_end === true, updated_at: new Date().toISOString() }
  if (known) {
    const { error } = await db.from('employer_pro_subscriptions').update(update).eq('stripe_subscription_id', subscription.id)
    if (error) throw new Error('Could not update subscription')
  } else {
    const { error } = await db.from('employer_pro_subscriptions').insert({ stripe_subscription_id: subscription.id, livemode: event.livemode, stripe_customer_id: idOf(subscription.customer), ...update })
    if (error && error.code !== '23505') throw new Error('Could not record subscription')
  }
  await db.from('employer_billing_events').update({ outcome: subscription.status }).eq('event_id', event.id)
  return done(subscription.status)
}

async function handleCharge(db: SupabaseClient, event: Stripe.Event): Promise<BillingOutcome> {
  const object = event.data.object as Stripe.Charge | Stripe.Dispute
  const paymentIntent = idOf(object.payment_intent)
  if (!paymentIntent) return skip
  // Cheap check first, so unrelated charges never touch the employer event ledger.
  const [order, period] = await Promise.all([
    db.from('employer_orders').select('id').eq('stripe_payment_intent_id', paymentIntent).maybeSingle(),
    db.from('employer_pro_periods').select('id').eq('stripe_payment_intent_id', paymentIntent).maybeSingle(),
  ])
  if (!order.data && !period.data) return skip
  const kind = event.type === 'charge.dispute.created' ? 'disputed' : (object as Stripe.Charge).refunded ? 'refunded' : 'partial_refund'
  const result = await rpc<{ outcome: string }>(db, 'reconcile_employer_refund', {
    p_event_id: event.id, p_event_type: event.type, p_payment_intent: paymentIntent, p_kind: kind,
  })
  if (result.outcome !== 'duplicate') {
    await ownerAlert('JobLink employer payment reversed', `An employer payment was ${kind.replace('_', ' ')}. Unspent Spotlights were frozen; review it in Admin > Employer billing.`)
  }
  return done(result.outcome)
}

/**
 * The employer pricing branch of the Stripe webhook. Runs after the signature
 * is verified and before the legacy employer flow, so a Spotlight or new Pro
 * event never reaches the old "is_pro on checkout" logic.
 *
 * Returns handled=false for anything that is not ours. Throws on a database or
 * Stripe failure: nothing has been committed (each write is one transaction),
 * and the 500 makes Stripe retry.
 */
export async function handleEmployerBillingEvent(stripe: Stripe, db: SupabaseClient, event: Stripe.Event): Promise<BillingOutcome> {
  if (!employerBillingEnabled()) return skip
  const config = employerBillingConfig()
  if (!config) return skip
  const relevant = [
    'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
    'invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed',
    'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
    'charge.refunded', 'charge.dispute.created',
  ]
  if (!relevant.includes(event.type)) return skip
  // A sandbox event must never grant anything in live, or the reverse.
  if (event.livemode !== config.livemode) return skip

  if (event.type.startsWith('checkout.session.')) return handleSession(stripe, db, config, event)
  if (event.type.startsWith('invoice.')) return handleInvoice(stripe, db, config, event)
  if (event.type.startsWith('customer.subscription.')) return handleSubscription(db, config, event)
  return handleCharge(db, event)
}
