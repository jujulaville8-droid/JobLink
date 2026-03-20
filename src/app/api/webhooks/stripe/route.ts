import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import Stripe from 'stripe'

/** Helper: get current_period_end from the first subscription item */
function getSubscriptionPeriodEnd(sub: Stripe.Subscription): string {
  const item = sub.items.data[0]
  return new Date(item.current_period_end * 1000).toISOString()
}

/** Helper: extract subscription ID from invoice.parent */
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details
  if (!details) return null
  return typeof details.subscription === 'string'
    ? details.subscription
    : details.subscription.id
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event

  const stripe = getStripe()

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const companyId = session.metadata?.company_id

        if (!companyId) {
          console.error('No company_id in session metadata')
          break
        }

        // Set company to pro and save stripe customer id
        await supabase
          .from('companies')
          .update({
            is_pro: true,
            stripe_customer_id: session.customer as string,
          })
          .eq('id', companyId)

        // Insert subscription record
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        )

        await supabase.from('subscriptions').insert({
          company_id: companyId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: session.customer as string,
          status: subscription.status,
          current_period_end: getSubscriptionPeriodEnd(subscription),
        })

        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = getSubscriptionIdFromInvoice(invoice)

        if (!subscriptionId) break

        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId)

        // Update subscription period
        await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            current_period_end: getSubscriptionPeriodEnd(subscription),
          })
          .eq('stripe_subscription_id', subscriptionId)

        // Ensure company stays pro
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id

        if (customerId) {
          await supabase
            .from('companies')
            .update({ is_pro: true })
            .eq('stripe_customer_id', customerId)
        }

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id

        // Mark subscription as canceled
        await supabase
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', subscription.id)

        // Remove pro status
        await supabase
          .from('companies')
          .update({ is_pro: false })
          .eq('stripe_customer_id', customerId)

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id

        if (!customerId) break

        const subscriptionId = getSubscriptionIdFromInvoice(invoice)

        if (subscriptionId) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId)
        }

        // Also flag on the company
        await supabase
          .from('companies')
          .update({ is_pro: false })
          .eq('stripe_customer_id', customerId)

        break
      }
    }
  } catch (err) {
    console.error('Error processing webhook event:', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
