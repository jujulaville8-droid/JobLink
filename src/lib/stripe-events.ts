import type Stripe from 'stripe'

const objectId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id

/** Normalize verified events. Refresh subscription state to tolerate delayed delivery. */
export async function normalizeStripeEvent(event: Stripe.Event, stripe: Stripe) {
  const base = { id: event.id, type: event.type, created: event.created }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.purchase_type === 'smart_resume') {
      if (session.payment_status !== 'paid') return { ...base, kind: 'ignored' }
      if (!session.metadata.user_id) throw new Error('Paid checkout missing user identity')
      return { ...base, kind: 'purchase', user_id: session.metadata.user_id, session_id: session.id }
    }
    if (session.mode !== 'subscription') return { ...base, kind: 'ignored' }
    const id = objectId(session.subscription)
    if (!id) throw new Error('Subscription checkout missing subscription')
    return subscriptionEvent(base, await stripe.subscriptions.retrieve(id), session.metadata || {})
  }
  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    const sub = event.data.object as Stripe.Subscription
    return subscriptionEvent(base, event.type === 'customer.subscription.deleted' ? sub : await stripe.subscriptions.retrieve(sub.id))
  }
  if (event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const id = objectId(invoice.parent?.subscription_details?.subscription)
    if (!id) return { ...base, kind: 'ignored' }
    return subscriptionEvent(base, await stripe.subscriptions.retrieve(id))
  }
  return { ...base, kind: 'ignored' }
}

function subscriptionEvent(base: { id: string; type: string; created: number }, sub: Stripe.Subscription, metadata: Record<string, string> = {}) {
  const periodEnd = sub.items.data[0]?.current_period_end
  const customer = objectId(sub.customer)
  if (!periodEnd || !customer) throw new Error('Incomplete subscription')
  return {
    ...base, kind: 'subscription', subscription_id: sub.id, customer_id: customer,
    user_id: metadata.user_id || sub.metadata.user_id || null,
    company_id: metadata.company_id || sub.metadata.company_id || null,
    status: sub.status, current_period_end: new Date(periodEnd * 1000).toISOString(),
  }
}
