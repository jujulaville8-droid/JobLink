import { NextRequest, NextResponse } from 'next/server'
import { ensureCvProfile, recalculateCompletion } from '@/lib/cv-helpers'
import { requireVerifiedUser } from '@/lib/api-auth'

const TABLE = 'cv_volunteer'
const FIELDS = ['organization', 'role', 'description', 'start_date', 'end_date', 'is_current', 'sort_order'] as const

export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const body = await request.json()
    const cvProfileId = await ensureCvProfile(user.id)
    const payload: Record<string, unknown> = { cv_profile_id: cvProfileId }
    for (const f of FIELDS) if (body[f] !== undefined) payload[f] = body[f]
    const { error } = await supabase.from(TABLE).insert(payload)
    if (error) return NextResponse.json({ error: 'Failed to add' }, { status: 500 })
    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true }, { status: 201 })
  } catch { return NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const payload: Record<string, unknown> = {}
    for (const f of FIELDS) if (body[f] !== undefined) payload[f] = body[f]
    const { error } = await supabase.from(TABLE).update(payload).eq('id', body.id)
    if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
}
