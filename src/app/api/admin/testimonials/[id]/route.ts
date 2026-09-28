import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const { id } = await params
  const body = z.object({ status: z.enum(['approved', 'rejected']), updated_at: z.string().min(1) })
    .safeParse(await request.json().catch(() => null))
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: 'Invalid review' }, { status: 400 })
  let query = createAdminClient().from('placements').update({ review_status: body.data.status })
    .eq('id', id).eq('updated_at', body.data.updated_at).not('feedback', 'is', null)
  if (body.data.status === 'approved') query = query.eq('consent', true).gte('rating', 4)
  const { data, error } = await query.select('id').maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Feedback changed or is not eligible. Refresh before reviewing.' }, { status: 409 })
  return NextResponse.json({ success: true })
}
