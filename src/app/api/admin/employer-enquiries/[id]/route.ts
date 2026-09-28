import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enquiryStatuses } from '@/lib/employer-pilot'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { data, error } = await createAdminClient().from('employer_enquiries').select('id, company_name, job_title, details').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not load request' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const { id } = await params
  const body = z.object({ status: z.enum(enquiryStatuses), notes: z.string().max(6000), listing_id: z.uuid().nullable(), updated_at: z.string().min(1) }).safeParse(await request.json().catch(() => null))
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: 'Check the status, notes and listing ID.' }, { status: 400 })
  const db = createAdminClient()
  if (body.data.status === 'live' && !body.data.listing_id) return NextResponse.json({ error: 'Link the published job before marking this live.' }, { status: 400 })
  if (body.data.listing_id) {
    const { data: job, error } = await db.from('job_listings').select('id, status, expires_at').eq('id', body.data.listing_id).maybeSingle()
    if (error || !job || (body.data.status === 'live' && (job.status !== 'active' || (job.expires_at && Date.parse(job.expires_at) <= Date.now())))) return NextResponse.json({ error: 'Choose an existing, active job listing.' }, { status: 400 })
  }
  const { updated_at, ...updates } = body.data
  const { data, error } = await db.from('employer_enquiries').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).eq('updated_at', updated_at).select('id').maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'This request changed. Refresh the page before saving.' }, { status: 409 })
  return NextResponse.json({ success: true })
}
