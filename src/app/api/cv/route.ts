import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchFullCv, recalculateCompletion } from '@/lib/cv-helpers'

// GET: Fetch full CV with all sections
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const cv = await fetchFullCv(user.id)
    if (!cv) return NextResponse.json({ exists: false })

    return NextResponse.json({ exists: true, ...cv })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create or update CV profile (job_title, summary)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const payload: Record<string, unknown> = {}

    if (body.job_title !== undefined) payload.job_title = body.job_title
    if (body.summary !== undefined) payload.summary = body.summary

    // Upsert
    const { data: existing } = await supabase
      .from('cv_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('cv_profiles')
        .update(payload)
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: 'Failed to update CV' }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('cv_profiles')
        .insert({ user_id: user.id, ...payload })
      if (error) return NextResponse.json({ error: 'Failed to create CV' }, { status: 500 })
    }

    const percentage = await recalculateCompletion(user.id)
    return NextResponse.json({ success: true, completion_percentage: percentage })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete entire CV (cascades to all sections)
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('cv_profiles')
      .delete()
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: 'Failed to delete CV' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
