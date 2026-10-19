import Stripe from 'stripe';
import { requireAdmin } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { writingConfig, writingJson, writingLimit } from '@/lib/resume-writing-server';
import { getResumeWritingStripe, getResumeWritingWebhookSecret, resumeWritingPolicy } from '@/lib/resume-writing-stripe';
import { approvedWritingTerms } from '@/lib/resume-writing-terms';

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const limited = await writingLimit(`readiness:${auth.user.id}`);
  if (limited) return limited;
  const checks: Record<string, boolean> = {};
  let linkActive = false;
  try {
    const policy = resumeWritingPolicy();
    checks.liveMode = policy.mode === 'live';
    checks.restrictedLiveReader = /^rk_live_[A-Za-z0-9]+$/.test(process.env.RESUME_WRITING_LIVE_SECRET_KEY ?? '');
    const config = writingConfig();
    checks.approvedTerms = JSON.stringify(config.terms) === JSON.stringify(approvedWritingTerms);
    const stripe = getResumeWritingStripe();
    const account = await stripe.accounts.retrieve();
    checks.account = account.id === policy.accountId;
    const [price, product, link] = await Promise.all([
      stripe.prices.retrieve(policy.priceId), stripe.products.retrieve(policy.productId),
      stripe.paymentLinks.retrieve(policy.paymentLinkId, { expand: ['line_items.data.price.product'] }),
    ]);
    checks.price = price.id === policy.priceId && price.active && price.livemode === policy.livemode && price.type === 'one_time'
      && price.currency === 'xcd' && price.unit_amount === 5000 && (typeof price.product === 'string' ? price.product : price.product.id) === policy.productId;
    checks.product = product.id === policy.productId && product.active && product.livemode === policy.livemode;
    const lines = link.line_items;
    checks.link = link.id === policy.paymentLinkId && link.url === policy.paymentLinkUrl && link.livemode === policy.livemode
      && !!lines && !lines.has_more && lines.data.length === 1 && lines.data[0].quantity === 1 && lines.data[0].price?.id === policy.priceId
      && !link.automatic_tax.enabled && !link.allow_promotion_codes && !(link.shipping_options?.length) && !(link.optional_items?.length);
    linkActive = link.active;
    // These deliberate missing-object reads return no customer/payment data.
    // They prove this request path is permitted, not a real payment lifecycle.
    async function missingRead(read: () => Promise<unknown>) {
      try { await read(); return false; } catch (failure) {
        return failure instanceof Stripe.errors.StripeInvalidRequestError && failure.code === 'resource_missing';
      }
    }
    checks.sessionReadPath = await missingRead(() => stripe.checkout.sessions.retrieve('cs_live_JobLinkReadinessMissing'));
    checks.intentReadPath = await missingRead(() => stripe.paymentIntents.retrieve('pi_JobLinkReadinessMissing'));
    checks.chargeReadPath = await missingRead(() => stripe.charges.retrieve('ch_JobLinkReadinessMissing'));
    const signingSecret = getResumeWritingWebhookSecret();
    const payload = JSON.stringify({ id: 'evt_local_readiness', type: 'ping', livemode: true, data: { object: {} } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
    checks.signingLocalRoundTrip = Stripe.webhooks.constructEvent(payload, signature, signingSecret).id === 'evt_local_readiness';
    const db = createAdminClient();
    const tables = ['orders', 'receipts', 'events', 'actions', 'counts', 'files'];
    const schema = await Promise.all(tables.map(table => db.from(`resume_writing_${table}`).select(table === 'counts' ? 'day' : table === 'receipts' ? 'session_id' : table === 'events' ? 'event_id' : 'id').limit(0)));
    checks.schemaReachable = schema.every(result => !result.error);
    const dates = await db.from('resume_writing_orders').select('paid_at,first_draft_due_at,revision_expires_at,completed_at').limit(0);
    checks.launchSchema = !dates.error;
    const bucket = await db.storage.getBucket('resume-writing-private');
    checks.privateBucket = !bucket.error && !!bucket.data && !bucket.data.public && Number(bucket.data.file_size_limit) === 3145728
      && bucket.data.allowed_mime_types?.length === 2 && bucket.data.allowed_mime_types.includes('application/pdf')
      && bucket.data.allowed_mime_types.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch { return writingJson({ checks, configurationReady: false, error: 'A required configuration check failed. No credentials or provider details are returned.' }, 503); }
  return writingJson({ checks, configurationReady: Object.values(checks).every(Boolean), linkActive,
    serviceEnabled: process.env.RESUME_WRITING_ENABLED === 'true', checkoutEnabled: process.env.RESUME_WRITING_CHECKOUT_ENABLED === 'true',
    webhookBinding: 'A genuine Stripe-signed delivery is required; the local round trip does not prove endpoint-secret binding.',
    operations: 'Refunds and 90-day file removal are manual. No automatic purge is installed.' });
}
