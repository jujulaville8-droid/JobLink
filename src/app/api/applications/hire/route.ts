import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireVerifiedUser } from '@/lib/api-auth'
import { requestTestimonial } from '@/lib/testimonials'

export async function POST(request: NextRequest) {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  const body = z.object({ application_id: z.uuid(), close_job: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Choose an application and whether to close the listing.' }, { status: 400 })
  const { data, error } = await createAdminClient().rpc('confirm_placement', {
    p_application: body.data.application_id, p_employer: auth.user.id, p_close: body.data.close_job,
  })
  if (error) return NextResponse.json({ error: 'Could not confirm this hire. Check that the application belongs to you and try again.' }, { status: 400 })
  after(async () => {
    try { await requestTestimonial(data) } catch { console.error('[testimonials] Request queued for retry') }
  })
  return NextResponse.json({ success: true, placement_id: data, closed: body.data.close_job })
}
