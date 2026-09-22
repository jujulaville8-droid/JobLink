import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeStripeEvent } from '@/lib/stripe-events'
import type Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Payments temporarily unavailable' }, { status: 503 })
  }
  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }
  try {
    const normalized = await normalizeStripeEvent(event, stripe)
    // The event ledger and every entitlement write commit or roll back together.
    const { error } = await createAdminClient().rpc('process_stripe_event', { p_event: normalized })
    if (error) throw error
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[stripe-webhook] Persistence failed for event', event.id, error)
    return NextResponse.json({ error: 'Webhook processing failed; retry required' }, { status: 500 })
  }
}
