import 'server-only';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resumeWritingPayment, resumeWritingPolicy, resumeWritingSessionId, type WritingPaymentPolicy } from '@/lib/resume-writing-stripe';
export { resumeWritingPayment } from '@/lib/resume-writing-stripe';
export class ResumeWritingPaymentError extends Error {
  constructor(public readonly code: 'unverified_payment' | 'provider_unavailable' | 'storage_unavailable' | 'checkout_unavailable') { super(code); }
}
type Reader = Pick<Stripe, 'accounts' | 'checkout' | 'paymentLinks'>;
export type WritingPaymentSnapshot = {
  sessionId: string; reference: string | null; state: 'pending'|'failed'|'expired'|'paid'|'refunded'|'disputed';
  paymentIntentId: string | null; chargeId: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const objectId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;
const reject = (): never => { throw new ResumeWritingPaymentError('unverified_payment'); };
const validLines = (lines: Stripe.ApiList<Stripe.LineItem> | undefined, p:WritingPaymentPolicy) => {
  const line = lines?.data[0]; const price = line?.price;
  return !!lines && !lines.has_more && lines.data.length === 1 && line?.quantity === 1 && !!price
    && price.id === p.priceId && objectId(price.product) === p.productId && price.currency === p.currency && price.unit_amount === p.amount;
};

/** Retrieve authoritative facts; never trust return parameters, email or metadata. */
export async function inspectResumeWritingSession(stripe: Reader, sessionId: string, eventType = ''): Promise<WritingPaymentSnapshot> {
  const p=resumeWritingPolicy();
  if (!resumeWritingSessionId(sessionId)) reject();
  let session: Stripe.Checkout.Session;
  try {
    if ((await stripe.accounts.retrieve()).id !== p.accountId) reject();
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items.data.price.product', 'payment_intent.latest_charge'] });
  } catch (error) {
    if (error instanceof ResumeWritingPaymentError) throw error;
    throw new ResumeWritingPaymentError('provider_unavailable');
  }
  if (session.id !== sessionId || session.mode !== 'payment' || session.livemode !== p.livemode
    || objectId(session.payment_link) !== p.paymentLinkId || session.currency !== p.currency
    || session.amount_total !== p.amount || session.amount_subtotal !== p.amount || !validLines(session.line_items,p)
    || !session.total_details || session.total_details.amount_discount !== 0 || session.total_details.amount_tax !== 0
    || session.total_details.amount_shipping !== 0) reject();
  const reference = session.client_reference_id && uuid.test(session.client_reference_id) ? session.client_reference_id : null;
  const intent = session.payment_intent;
  const base = { sessionId: session.id, reference, paymentIntentId: objectId(intent) ?? null, chargeId: null };
  if (session.payment_status === 'unpaid') {
    const state = session.status === 'expired' ? 'expired' : eventType === 'checkout.session.async_payment_failed' ? 'failed' : 'pending';
    return { ...base, state };
  }
  if (session.payment_status !== 'paid' || session.status !== 'complete' || !intent || typeof intent === 'string'
    || intent.status !== 'succeeded' || intent.currency !== p.currency || intent.amount_received !== p.amount) return reject();
  const charge = intent.latest_charge;
  if (!charge || typeof charge === 'string' || !charge.paid || !charge.captured || charge.status !== 'succeeded'
    || charge.currency !== p.currency || charge.amount_captured !== p.amount) return reject();
  return { ...base, paymentIntentId: intent.id, chargeId: charge.id,
    state: charge.disputed ? 'disputed' : charge.refunded || charge.amount_refunded > 0 ? 'refunded' : 'paid' };
}

/** One DB transaction binds a known private reference, receipt and event to its order. */
export async function reconcileResumeWritingSession(stripe: Reader, db: SupabaseClient, event: { id: string; type: string; created?:number; data?:{object?:unknown} }, sessionId: string) {
  const snapshot = await inspectResumeWritingSession(stripe, sessionId, event.type);
  // Only the original, signature-verified success event anchors payment time.
  // Charge creation, a late delivery/replay, and manual reads cannot restart it.
  const eventSession=event.data?.object as {id?:unknown;payment_status?:unknown}|undefined;
  const successEvent=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)
    && eventSession?.id===sessionId && eventSession.payment_status==='paid';
  const created=event.created;
  const paidAt=snapshot.state==='paid'&&successEvent&&typeof created==='number'&&Number.isSafeInteger(created)&&created>0&&created*1000<=Date.now()+300000
    ?new Date(created*1000).toISOString():null;
  const { data, error } = await db.rpc('reconcile_resume_writing_payment', {
    p_event_id: event.id, p_event_type: event.type, p_session_id: snapshot.sessionId, p_reference: snapshot.reference,
    p_state: snapshot.state, p_payment_intent_id: snapshot.paymentIntentId, p_charge_id: snapshot.chargeId,
    p_payment_policy:resumeWritingPolicy().key,p_paid_at:paidAt,
  });
  if (error || !data) throw new ResumeWritingPaymentError('storage_unavailable');
  return data as { outcome: string; duplicate: boolean; orderId?: string };
}

/** Called after signature verification, before the legacy event claim/subscription flow. */
export async function handleResumeWritingStripeEvent(stripe: Reader | (()=>Reader), db: SupabaseClient, event: Stripe.Event) {
  const reader=()=>typeof stripe==='function'?stripe():stripe;
  const checkoutEvents = ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'];
  if (checkoutEvents.includes(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    const link=objectId(session.payment_link);
    if (!link || (link !== resumeWritingPayment.paymentLinkId && link !== process.env.RESUME_WRITING_SANDBOX_PAYMENT_LINK_ID)) return false;
    if (process.env.RESUME_WRITING_ENABLED !== 'true') throw new ResumeWritingPaymentError('checkout_unavailable');
    if(link!==resumeWritingPolicy().paymentLinkId)throw new ResumeWritingPaymentError('unverified_payment');
    await reconcileResumeWritingSession(reader(), db, event, session.id);
    return true;
  }
  if (event.type !== 'charge.refunded' && !event.type.startsWith('charge.dispute.')) return false;
  if (process.env.RESUME_WRITING_ENABLED !== 'true') return false;
  const p=resumeWritingPolicy();
  if(event.livemode!==p.livemode)return false;
  const paymentIntent = objectId((event.data.object as Stripe.Charge | Stripe.Dispute).payment_intent);
  if (!paymentIntent) return false;
  const found = await db.from('resume_writing_receipts').select('session_id').eq('payment_intent_id', paymentIntent).maybeSingle();
  if (found.error) throw new ResumeWritingPaymentError('storage_unavailable');
  let sessionId = found.data?.session_id as string | undefined;
  if (!sessionId) {
    // A refund/dispute may arrive before the completed event. Discover its
    // session without matching customers by email or reading any résumé data.
    const sessions = await reader().checkout.sessions.list({ payment_intent: paymentIntent, limit: 2 });
    sessionId = sessions.data.find(s => objectId(s.payment_link) === p.paymentLinkId)?.id;
  }
  if (!sessionId) return false;
  await reconcileResumeWritingSession(reader(), db, event, sessionId);
  return true;
}

/** Does not activate the staged link; refuses inactive or changed resources. */
export async function verifiedResumeCheckoutUrl(stripe: Reader, reference: string) {
  const p=resumeWritingPolicy();
  if (!uuid.test(reference)) reject();
  if ((await stripe.accounts.retrieve()).id !== p.accountId) reject();
  const link = await stripe.paymentLinks.retrieve(p.paymentLinkId, { expand: ['line_items.data.price.product'] });
  if (!link.active || link.livemode!==p.livemode || link.url !== p.paymentLinkUrl || !validLines(link.line_items,p)) {
    throw new ResumeWritingPaymentError('checkout_unavailable');
  }
  const url = new URL(p.paymentLinkUrl);
  url.searchParams.set('client_reference_id', reference);
  return url.toString();
}
