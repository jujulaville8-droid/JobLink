import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireVerifiedUser } from '@/lib/api-auth'
import { requestTestimonial } from '@/lib/testimonials'
import { notifyApplicantsOfJobClosure } from '@/lib/job-closure-notifications'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  const body = z.object({ application_id: z.uuid(), close_job: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Choose an application and whether to close the listing.' }, { status: 400 })
  const db = createAdminClient()
  const args = {
    p_application: body.data.application_id, p_employer: auth.user.id, p_close: body.data.close_job,
  }
  const result = await db.rpc('confirm_placement_with_closure', args)
  let data = result.data?.placement_id
  let error = result.error
  let closedJobId = result.data?.closed_job_id
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    // An unapplied migration must not break the existing atomic hire flow.
    // Without a trustworthy transition result, skip applicant delivery safely.
    const legacy = await db.rpc('confirm_placement', args)
    data = legacy.data; error = legacy.error; closedJobId = null
    console.warn('[job-closure] Hire closure notification unavailable until migration is applied')
  }
  if (error) return NextResponse.json({ error: 'Could not confirm this hire. Check that the application belongs to you and try again.' }, { status: 400 })
  after(async () => {
    try { await requestTestimonial(data) } catch { console.error('[testimonials] Request queued for retry') }
    if (closedJobId) await notifyApplicantsOfJobClosure(closedJobId)
  })
  return NextResponse.json({ success: true, placement_id: data, closed: body.data.close_job })
}
