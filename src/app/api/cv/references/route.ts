import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureCvProfile, recalculateCompletion } from '@/lib/cv-helpers'

const TABLE = 'cv_references'
const FIELDS = ['name', 'title', 'company', 'phone', 'email', 'relationship', 'sort_order'] as const

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
}
