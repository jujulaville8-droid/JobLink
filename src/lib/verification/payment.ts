import 'server-only'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { BASE_URL, sendEmail } from '@/lib/email'
import {
  loadVerifications, ownerAlert, seekerEmail, uploadsOpen, verificationPriceId,
  type SeekerContext, type VerificationRow,
} from './server'
import { VERIFICATION_AMOUNT_CENTS, VERIFICATION_CURRENCY, antiguaToday, badgeIsValid, daysBetween } from './shared'

export const VERIFICATION_PURCHASE_TYPE = 'seeker_verification'
/** A badge can be renewed once it is within this many days of ending. */
export const RENEWAL_WINDOW_DAYS = 30

export class CheckoutRefused extends Error {
  constructor(public code: 'IN_PROGRESS' | 'ALREADY_VERIFIED' | 'NAME_REQUIRED' | 'UNAVAILABLE', message: string) { super(message) }
}

/**
 * Create (or reuse) the awaiting-payment check and a Stripe Checkout Session
 * for it. The verification id travels in the session metadata; the webhook
 * trusts only what Stripe signed, and re-checks the amount and currency.
 */
export async function createVerificationCheckout({ user, db, profile }: SeekerContext): Promise<string> {
  const price = verificationPriceId()
  if (!price) throw new CheckoutRefused('UNAVAILABLE', 'Verified is not available right now.')
  // The reviewer matches the documents against this name.
  if (!profile.first_name?.trim() || !profile.last_name?.trim()) {
    throw new CheckoutRefused('NAME_REQUIRED', 'Add your first and last name to your profile first, exactly as they appear on your ID.')
  }

  const current = await loadVerifications(db, user.id)
  if (current.open && current.open.status !== 'awaiting_payment') {
    throw new CheckoutRefused('IN_PROGRESS', 'You already have a verification in progress.')
  }
  if (badgeIsValid(current.badge) && daysBetween(antiguaToday(), current.badge!.verified_until!) > RENEWAL_WINDOW_DAYS) {
    throw new CheckoutRefused('ALREADY_VERIFIED', 'You are already verified. You can renew in the last 30 days before your badge ends.')
  }

  let verification = current.open
  if (!verification) {
    const created = await db.from('seeker_verifications')
      .insert({ seeker_id: profile.id, user_id: user.id }).select('*').single()
    if (created.error) {
      // Two taps at once: the unique index let one through. Use that one.
      if (created.error.code !== '23505') throw new Error('Could not start verification')
      verification = (await loadVerifications(db, user.id)).open
      if (!verification || verification.status !== 'awaiting_payment') {
        throw new CheckoutRefused('IN_PROGRESS', 'You already have a verification in progress.')
      }
    } else verification = created.data as VerificationRow
  }

  const metadata = { purchase_type: VERIFICATION_PURCHASE_TYPE, verification_id: verification.id, user_id: user.id }
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: verification.id,
    customer_email: user.email || undefined,
    metadata,
    payment_intent_data: { metadata, description: 'JobLink Verified: verification fee, 6 months' },
    custom_text: {
      submit: { message: 'EC$40 verification fee. Covers checking your documents and storing your police record securely for 6 months. If we can’t verify you, we refund you in full.' },
    },
    success_url: `${BASE_URL}/verification?paid=1`,
    cancel_url: `${BASE_URL}/verification?cancelled=1`,
  })
  if (!session.url) throw new Error('Checkout unavailable')
  return session.url
}

export type PaymentOutcome = 'paid' | 'duplicate' | 'refused'

/**
 * The verification branch of the Stripe webhook.
 *
 * Runs after the webhook has verified the signature and claimed the event id
 * in stripe_webhook_events, so a redelivery never reaches here twice. A thrown
 * error releases that claim and lets Stripe retry; a refusal (wrong amount,
 * unknown check) is final and alerts the owner, because money has moved.
 */
export async function handleVerificationPayment(db: SupabaseClient, session: Stripe.Checkout.Session): Promise<PaymentOutcome> {
  const verificationId = session.metadata?.verification_id
  const userId = session.metadata?.user_id
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  const refuse = async (reason: string): Promise<PaymentOutcome> => {
    console.error(`[verification-payment] Refused: ${reason}`, { sessionId: session.id })
    await ownerAlert('JobLink Verified: payment needs a look', `A verification payment was not applied (${reason}). Check Stripe and refund if needed.`)
    return 'refused'
  }

  if (!verificationId || !/^[0-9a-f-]{36}$/.test(verificationId) || !userId) return refuse('missing reference')
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return refuse('not a completed one-off payment')
  if (session.amount_total !== VERIFICATION_AMOUNT_CENTS || session.currency?.toLowerCase() !== VERIFICATION_CURRENCY) {
    return refuse('wrong amount or currency')
  }
  if (!paymentIntent) return refuse('missing payment reference')

  const found = await db.from('seeker_verifications').select('*').eq('id', verificationId).maybeSingle()
  if (found.error) throw new Error('Could not load verification')
  const verification = found.data as VerificationRow | null
  if (!verification || verification.user_id !== userId) return refuse('unknown verification')
  if (verification.status !== 'awaiting_payment') {
    return verification.stripe_checkout_session_id === session.id ? 'duplicate' : refuse('verification already paid by another payment')
  }

  // Conditional on the status so two deliveries racing cannot both apply.
  const updated = await db.from('seeker_verifications')
    .update({ status: 'paid', stripe_checkout_session_id: session.id, stripe_payment_intent_id: paymentIntent, paid_at: new Date().toISOString() })
    .eq('id', verification.id).eq('status', 'awaiting_payment').select('id').maybeSingle()
  if (updated.error) throw new Error('Could not record verification payment')
  if (!updated.data) return 'duplicate'

  await notifyPaid(db, verification.user_id)
  return 'paid'
}

/** Tell the job seeker what happens next, and the owner if uploads are still locked. */
async function notifyPaid(db: SupabaseClient, userId: string): Promise<void> {
  try {
    const [open, email] = await Promise.all([uploadsOpen(db), seekerEmail(db, userId)])
    if (email) await sendEmail({ to: email, type: open ? 'verification_upload_ready' : 'verification_paid_waiting' })
    if (!open) {
      await ownerAlert(
        'JobLink Verified: first payment received',
        'A verification has been paid and uploads are locked. Upgrade Supabase to Pro, accept its data processing agreement, then open uploads in Admin > Verifications. The job seeker was told to expect an email within 24 hours.',
      )
    }
  } catch {
    // The payment is recorded; a failed notice must not make Stripe retry it.
    console.error('[verification-payment] Notification failed')
  }
}

/**
 * Full refund of a verification fee. Idempotent on the verification id, so a
 * retry after a half-finished decision returns the same refund.
 */
export async function refundVerification(verification: Pick<VerificationRow, 'id' | 'stripe_payment_intent_id' | 'stripe_refund_id'>): Promise<string> {
  if (verification.stripe_refund_id) return verification.stripe_refund_id
  if (!verification.stripe_payment_intent_id) throw new Error('No payment to refund')
  const refund = await getStripe().refunds.create(
    {
      payment_intent: verification.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      metadata: { purchase_type: VERIFICATION_PURCHASE_TYPE, verification_id: verification.id },
    },
    { idempotencyKey: `verification-refund-${verification.id}` },
  )
  if (!refund.id || refund.status === 'failed' || refund.status === 'canceled') throw new Error('Refund failed')
  return refund.id
}
