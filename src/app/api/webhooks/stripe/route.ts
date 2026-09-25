import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
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

/**
 * supabase-js returns errors instead of throwing them, so an unchecked write
 * left the handler reporting success while the database was untouched: the
 * customer paid, Pro was never applied, and Stripe saw a 200 so never retried.
 * Every write goes through here and a failure aborts the handler, which
 * returns 500 and lets Stripe retry.
 */
class WebhookWriteError extends Error {}

async function mustSucceed<T extends { error: { message: string } | null }>(
  operation: PromiseLike<T>,
  description: string
): Promise<T> {
  const result = await operation
  if (result.error) {
    throw new WebhookWriteError(`${description}: ${result.error.message}`)
  }
  return result
}

/**
 * Record the event id before doing any work.
 *
 * Stripe retries deliveries, and the table has a primary key on the id, so a
 * duplicate insert fails and we skip the handler. Without this, a retry of
 * checkout.session.completed inserted a second subscription row and a second
 * ai_purchases row.
 */
async function claimEvent(
  supabase: SupabaseClient,
  event: Stripe.Event
): Promise<boolean> {
  const { error } = await supabase
    .from('stripe_webhook_events')
    .insert({ id: event.id, type: event.type })

  if (!error) return true

  // 23505 = unique violation: this event was already processed.
  if (error.code === '23505') return false

  throw new WebhookWriteError(`Could not record event ${event.id}: ${error.message}`)
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    // Previously this was `process.env.STRIPE_WEBHOOK_SECRET!`, so a missing
    // secret surfaced as an opaque signature failure on every delivery.
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event

  const stripe = getStripe()

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[stripe-webhook] Signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    const isNewEvent = await claimEvent(supabase, event)
    if (!isNewEvent) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const purchaseType = session.metadata?.purchase_type
        const userId = session.metadata?.user_id

        // Handle Smart Resume one-time purchase
        if (purchaseType === 'smart_resume' && userId) {
          await mustSucceed(
            supabase.from('ai_purchases').insert({
              user_id: userId,
              feature: 'smart_resume',
              stripe_session_id: session.id,
            }),
            'insert ai_purchases'
          )
          break
        }

        // Employer Pro subscription flow
        let companyId = session.metadata?.company_id

        // If no company_id in metadata, look up by user_id (user paid before creating company)
        if (!companyId && userId) {
          const { data: company } = await supabase
            .from('companies')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle()

          companyId = company?.id
        }

        if (companyId) {
          // Set company to pro and save stripe customer id
          await mustSucceed(
            supabase
              .from('companies')
              .update({
                is_pro: true,
                stripe_customer_id: session.customer as string,
              })
              .eq('id', companyId),
            'mark company pro'
          )

          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          )

          // upsert rather than insert: the subscription id is unique, so a
          // resubscribe after cancellation would otherwise collide.
          await mustSucceed(
            supabase.from('subscriptions').upsert(
              {
                company_id: companyId,
                stripe_subscription_id: subscription.id,
                stripe_customer_id: session.customer as string,
                status: subscription.status,
                current_period_end: getSubscriptionPeriodEnd(subscription),
              },
              { onConflict: 'stripe_subscription_id' }
            ),
            'upsert subscription'
          )
        } else if (userId) {
          // No company yet — store the Stripe customer ID on the user record
          // so we can link it when they create their company profile later
          await mustSucceed(
            supabase
              .from('users')
              .update({ stripe_customer_id: session.customer as string })
              .eq('id', userId),
            'store customer id on user'
          )
          console.log('[stripe-webhook] Checkout completed before company profile exists')
        } else {
          console.error(
            '[stripe-webhook] checkout.session.completed with no company_id or user_id',
            { sessionId: session.id }
          )
        }

        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = getSubscriptionIdFromInvoice(invoice)

        if (!subscriptionId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)

        await mustSucceed(
          supabase
            .from('subscriptions')
            .update({
              status: subscription.status,
              current_period_end: getSubscriptionPeriodEnd(subscription),
            })
            .eq('stripe_subscription_id', subscriptionId),
          'refresh subscription period'
        )

        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : invoice.customer?.id

        if (customerId) {
          await mustSucceed(
            supabase
              .from('companies')
              .update({ is_pro: true })
              .eq('stripe_customer_id', customerId),
            'keep company pro'
          )
        }

        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id

        await mustSucceed(
          supabase
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('stripe_subscription_id', subscription.id),
          'mark subscription canceled'
        )

        await mustSucceed(
          supabase
            .from('companies')
            .update({ is_pro: false })
            .eq('stripe_customer_id', customerId),
          'revoke pro'
        )

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
          await mustSucceed(
            supabase
              .from('subscriptions')
              .update({ status: 'past_due' })
              .eq('stripe_subscription_id', subscriptionId),
            'mark subscription past due'
          )
        }

        await mustSucceed(
          supabase
            .from('companies')
            .update({ is_pro: false })
            .eq('stripe_customer_id', customerId),
          'suspend pro after failed payment'
        )

        break
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[stripe-webhook] Failed processing ${event.type}:`, message)

    // Release the idempotency claim so Stripe's retry is actually processed
    // rather than being skipped as a duplicate.
    await supabase.from('stripe_webhook_events').delete().eq('id', event.id)

    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
