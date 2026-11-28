import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { BASE_URL } from '@/lib/email'
import { employerBillingEnabled } from '@/lib/employer-billing/config'
import { companyForUser } from '@/lib/employer-billing/entitlement'
import { billingJson, employerOnly, sameOrigin } from '@/lib/employer-billing/http'

/** Opens Stripe's billing portal so the employer can renew, cancel or update their card. */
export async function POST(request: Request) {
  if (!employerBillingEnabled()) return billingJson({ error: 'Not found' }, 404)
  if (!sameOrigin(request)) return billingJson({ error: 'Invalid request.' }, 400)
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  const db = createAdminClient()
  const refused = await employerOnly(db, auth.user.id)
  if (refused) return refused
  const company = await companyForUser(db, auth.user.id)
  if (!company) return billingJson({ error: 'Not found' }, 404)
  const { data: subscription } = await db.from('employer_pro_subscriptions').select('stripe_customer_id')
    .eq('company_id', company.id).not('stripe_customer_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!subscription?.stripe_customer_id) return billingJson({ error: 'No subscription to manage.' }, 404)
  try {
    const session = await getStripe().billingPortal.sessions.create({ customer: subscription.stripe_customer_id, return_url: `${BASE_URL}/billing` })
    return billingJson({ url: session.url })
  } catch {
    return billingJson({ error: 'Subscription management is not available right now. Contact JobLink.' }, 503)
  }
}
