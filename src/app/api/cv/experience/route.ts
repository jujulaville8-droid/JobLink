import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureCvProfile, recalculateCompletion } from '@/lib/cv-helpers'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const cvProfileId = await ensureCvProfile(user.id)

    const { data, error } = await supabase
      .from('cv_work_experiences')
      .insert({
        cv_profile_id: cvProfileId,
        company_name: body.company_name,
        job_title: body.job_title,
        location: body.location || null,
        start_date: body.start_date,
        end_date: body.end_date || null,
        is_current: body.is_current || false,
        description: body.description || null,
        sort_order: body.sort_order ?? 0,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Failed to add experience' }, { status: 500 })

    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true, experience: data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const payload: Record<string, unknown> = {}
    const fields = ['company_name', 'job_title', 'location', 'start_date', 'end_date', 'is_current', 'description', 'sort_order'] as const
    for (const f of fields) {
      if (body[f] !== undefined) payload[f] = body[f]
    }

    const { error } = await supabase
      .from('cv_work_experiences')
      .update(payload)
      .eq('id', body.id)

    if (error) return NextResponse.json({ error: 'Failed to update experience' }, { status: 500 })

    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { error } = await supabase
      .from('cv_work_experiences')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: 'Failed to delete experience' }, { status: 500 })

    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
