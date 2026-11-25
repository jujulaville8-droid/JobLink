import { z } from 'zod'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'
import { employerBillingEnabled } from '@/lib/employer-billing/config'
import { companyForUser } from '@/lib/employer-billing/entitlement'
import { billingJson, employerOnly, sameOrigin } from '@/lib/employer-billing/http'
import { ownerAlert } from '@/lib/verification/server'

const body = z.object({
  credit_id: z.uuid(),
  job_id: z.uuid(),
  requested_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict()

const messages: Record<string, string> = {
  credit_not_found: 'That Spotlight is not available.',
  credit_unavailable: 'That Spotlight has already been used.',
  credit_expired: 'That Spotlight expired at the end of its paid month.',
  job_not_eligible: 'Choose one of your live vacancies.',
}

/** Book a Spotlight: spends one credit on one of this company's live vacancies. JobLink then confirms and schedules it. */
export async function POST(request: Request) {
  if (!employerBillingEnabled()) return billingJson({ error: 'Not found' }, 404)
  if (!sameOrigin(request)) return billingJson({ error: 'Invalid request.' }, 400)
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  const db = createAdminClient()
  const refused = await employerOnly(db, auth.user.id)
  if (refused) return refused
  const limited = await enforceRateLimit(`employer-billing:redeem:${auth.user.id}`, RateLimits.checkout)
  if (limited) return limited
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return billingJson({ error: 'Choose a vacancy and a start date.' }, 400)
  const today = new Date().toISOString().slice(0, 10)
  if (parsed.data.requested_start < today) return billingJson({ error: 'Choose a start date from today.' }, 400)
  const company = await companyForUser(db, auth.user.id)
  if (!company) return billingJson({ error: 'Set up your company profile first.' }, 409)
  const { data, error } = await db.rpc('redeem_spotlight_credit', {
    p_credit_id: parsed.data.credit_id, p_company_id: company.id, p_job_id: parsed.data.job_id,
    p_requested_start: parsed.data.requested_start, p_actor_id: auth.user.id,
  })
  if (error) {
    const code = Object.keys(messages).find((key) => error.message.includes(key))
    const booked = error.message.includes('already has a Spotlight')
    return billingJson({ error: code ? messages[code] : booked ? 'This vacancy already has a Spotlight booked or running.' : 'That Spotlight could not be booked. Try again.' }, 409)
  }
  await ownerAlert('JobLink Spotlight booked', 'An employer booked a Spotlight. Confirm the vacancy, artwork and dates, then schedule it in Admin > Employer billing.')
  return billingJson({ success: true, campaign_id: (data as { campaignId: string }).campaignId })
}
