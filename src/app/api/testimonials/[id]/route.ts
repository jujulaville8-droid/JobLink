import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  const { id } = await params
  const body = z.object({ feedback: z.string().trim().min(10).max(600), rating: z.number().int().min(1).max(5), consent: z.boolean() })
    .safeParse(await request.json().catch(() => null))
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: 'Add 10–600 characters, a rating and your sharing preference.' }, { status: 400 })
  // Editing or withdrawing permission immediately removes any prior approval.
  const { data, error } = await createAdminClient().from('placements')
    .update({ ...body.data, review_status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', id).eq('employer_id', auth.user.id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not save feedback. Please try again.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Placement not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
