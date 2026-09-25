import { NextRequest, NextResponse } from 'next/server'
import { ensureCvProfile, recalculateCompletion } from '@/lib/cv-helpers'
import { requireVerifiedUser } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const body = await request.json()
    const cvProfileId = await ensureCvProfile(user.id)

    const { data, error } = await supabase
      .from('cv_awards')
      .insert({
        cv_profile_id: cvProfileId,
        title: body.title,
        issuer: body.issuer || null,
        date_received: body.date_received || null,
        description: body.description || null,
        sort_order: body.sort_order ?? 0,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Failed to add award' }, { status: 500 })

    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true, award: data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const payload: Record<string, unknown> = {}
    for (const f of ['title', 'issuer', 'date_received', 'description', 'sort_order'] as const) {
      if (body[f] !== undefined) payload[f] = body[f]
    }

    const { error } = await supabase.from('cv_awards').update(payload).eq('id', body.id)
    if (error) return NextResponse.json({ error: 'Failed to update award' }, { status: 500 })

    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabase.from('cv_awards').delete().eq('id', id)
    if (error) return NextResponse.json({ error: 'Failed to delete award' }, { status: 500 })

    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
