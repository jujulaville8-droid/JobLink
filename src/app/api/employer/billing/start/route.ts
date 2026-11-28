import { z } from 'zod'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'
import { employerSalesOpen } from '@/lib/employer-billing/config'
import { PurchaseRefused, startEmployerPurchase } from '@/lib/employer-billing/orders'
import { billingJson, employerOnly, sameOrigin } from '@/lib/employer-billing/http'

const body = z.object({ offer: z.enum(['spotlight', 'pro']), job_id: z.uuid().nullish() }).strict()

/** Start a Spotlight or Pro purchase: returns the Payment Link with this order's reference attached. */
export async function POST(request: Request) {
  if (!employerSalesOpen()) return billingJson({ error: 'Not found' }, 404)
  if (!sameOrigin(request)) return billingJson({ error: 'Invalid request.' }, 400)
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  const db = createAdminClient()
  const refused = await employerOnly(db, auth.user.id)
  if (refused) return refused
  const limited = await enforceRateLimit(`employer-billing:start:${auth.user.id}`, RateLimits.checkout)
  if (limited) return limited
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return billingJson({ error: 'Invalid request.' }, 400)
  try {
    const { url } = await startEmployerPurchase(db, { userId: auth.user.id, email: auth.user.email ?? null, offer: parsed.data.offer, jobId: parsed.data.job_id })
    return billingJson({ url })
  } catch (error) {
    if (error instanceof PurchaseRefused) return billingJson({ error: error.message, code: error.code }, 409)
    console.error('[employer-billing] Start failed')
    return billingJson({ error: 'We could not start the payment. You have not been charged.' }, 503)
  }
}
