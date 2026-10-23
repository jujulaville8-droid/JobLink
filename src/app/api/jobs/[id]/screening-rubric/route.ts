import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'
import { screeningRubricApprovalEnabled } from '@/lib/employer-screening/application'
import { validateScreeningCriteria } from '@/lib/employer-screening/privacy'

const requestSchema = z.object({
  approve: z.literal(true), expectedVersion: z.string().min(1).max(100).nullable(), criteria: z.unknown(),
}).strict()

/** Only the verified current employer-owner can approve a job-specific immutable
 * rubric. Body-supplied owner, company, version and approved markers are not trusted. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  if (!screeningRubricApprovalEnabled()) return NextResponse.json({ error: 'Rubric approval is disabled' }, { status: 503 })
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const limited = await enforceRateLimit(`screening-rubric:${auth.user.id}`, RateLimits.apply)
  if (limited) return limited
  try {
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid job' }, { status: 400 })
    const raw = await request.text()
    if (raw.length > 25_000) return NextResponse.json({ error: 'Rubric too large' }, { status: 413 })
    let criteria
    let body
    try {
      body = requestSchema.parse(JSON.parse(raw))
      criteria = validateScreeningCriteria(body.criteria)
    } catch { return NextResponse.json({ error: 'Only supported job-related criteria totaling 100 points can be approved' }, { status: 400 }) }
    const { data: user, error: userError } = await auth.supabase.from('users').select('role').eq('id', auth.user.id).single()
    if (userError || user?.role !== 'employer') return NextResponse.json({ error: 'Employer access required' }, { status: 403 })
    const { data: job, error: jobError } = await auth.supabase.from('job_listings')
      .select('id,company_id,companies(user_id)').eq('id', id).single()
    const company = job && (Array.isArray(job.companies) ? job.companies[0] : job.companies)
    if (jobError || !job || company?.user_id !== auth.user.id) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    // Database repeats ownership/verification and expected-version checks inside the transaction.
    const { data, error } = await createAdminClient().rpc('employer_screening_approve_rubric', {
      p_job_id: id, p_owner_user_id: auth.user.id, p_expected_version: body.expectedVersion, p_criteria: criteria,
    })
    if (error) {
      if (error.code === '40001') return NextResponse.json({ error: 'Rubric changed. Reload before approving.' }, { status: 409 })
      return NextResponse.json({ error: 'Rubric approval unavailable' }, { status: 503 })
    }
    const saved = z.object({ versionId: z.string().min(1), jobId: z.uuid(), approved: z.literal(true), criteria: z.unknown() }).passthrough().parse(data)
    if (saved.jobId !== id) throw new Error('Rubric identity mismatch')
    validateScreeningCriteria(saved.criteria)
    return NextResponse.json({ rubric: saved }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Rubric approval unavailable' }, { status: 503 })
  }
}
