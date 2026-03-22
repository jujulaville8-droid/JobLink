import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureCvProfile, recalculateCompletion } from '@/lib/cv-helpers'

// POST: Bulk replace all skills
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const skills: { name: string; sort_order?: number }[] = body.skills
    if (!Array.isArray(skills)) return NextResponse.json({ error: 'skills must be an array' }, { status: 400 })

    const cvProfileId = await ensureCvProfile(user.id)

    // Delete existing skills and insert new ones
    await supabase.from('cv_skills').delete().eq('cv_profile_id', cvProfileId)

    if (skills.length > 0) {
      const rows = skills.map((s, i) => ({
        cv_profile_id: cvProfileId,
        name: s.name.trim(),
        sort_order: s.sort_order ?? i,
      }))

      const { error } = await supabase.from('cv_skills').insert(rows)
      if (error) return NextResponse.json({ error: 'Failed to save skills' }, { status: 500 })
    }

    await recalculateCompletion(user.id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
