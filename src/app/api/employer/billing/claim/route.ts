import { z } from 'zod'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'
import { employerBillingEnabled } from '@/lib/employer-billing/config'
import { companyForUser } from '@/lib/employer-billing/entitlement'
import { claimableOrders } from '@/lib/employer-billing/orders'
import { billingJson, employerOnly, sameOrigin } from '@/lib/employer-billing/http'

/**
 * Claim a payment made through a shared link. Only paid, unassigned orders
 * whose Stripe receipt email is this employer's verified account email; staff
 * match anything else from the admin queue.
 */
export async function POST(request: Request) {
  if (!employerBillingEnabled()) return billingJson({ error: 'Not found' }, 404)
  if (!sameOrigin(request)) return billingJson({ error: 'Invalid request.' }, 400)
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  const db = createAdminClient()
  const refused = await employerOnly(db, auth.user.id)
  if (refused) return refused
  const limited = await enforceRateLimit(`employer-billing:claim:${auth.user.id}`, RateLimits.checkout)
  if (limited) return limited
  const parsed = z.object({ order_id: z.uuid() }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return billingJson({ error: 'Invalid request.' }, 400)
  const company = await companyForUser(db, auth.user.id)
  if (!company) return billingJson({ error: 'Set up your company profile first.' }, 409)
  if (!auth.user.email_confirmed_at) return billingJson({ error: 'Verify your email first.' }, 403)
  const claimable = await claimableOrders(db, auth.user.email)
  if (!claimable.some((order) => order.id === parsed.data.order_id)) return billingJson({ error: 'Not found' }, 404)
  const { error } = await db.rpc('assign_employer_order', { p_order_id: parsed.data.order_id, p_company_id: company.id, p_actor_id: auth.user.id })
  if (error) return billingJson({ error: 'This payment could not be claimed. Contact JobLink.' }, 409)
  return billingJson({ success: true })
}
