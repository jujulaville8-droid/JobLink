import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateProfileCompletion } from '@/lib/profile-completion'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ensure user row exists in public.users (trigger may have failed)
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!userRow) {
      const { error: userInsertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email!,
          role: (user.user_metadata?.role as string) || 'seeker',
        })

      if (userInsertError && userInsertError.code !== '23505') {
        console.error('Failed to create user row:', userInsertError)
        return NextResponse.json(
          { error: 'Account setup failed. Please contact support.' },
          { status: 500 }
        )
      }
    }

    const body = await request.json()
    const { profile_id, ...profileData } = body

    // Whitelist allowed fields — never accept arbitrary input
    const payload: Record<string, unknown> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    }

    const allowedFields = [
      'first_name', 'last_name', 'phone', 'location', 'bio',
      'skills', 'experience_years', 'education', 'cv_url',
      'avatar_url', 'visibility',
    ] as const

    for (const field of allowedFields) {
      if (profileData[field] !== undefined) {
        payload[field] = profileData[field]
      }
    }

    // Check if user has a built resume (for completion calc)
    const { data: cvProfile } = await supabase
      .from('cv_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    // Calculate profile completion server-side
    const { percentage } = calculateProfileCompletion({
      first_name: payload.first_name as string || null,
      last_name: payload.last_name as string || null,
      phone: payload.phone as string || null,
      bio: payload.bio as string || null,
      skills: payload.skills as string[] || null,
      experience_years: payload.experience_years as number || null,
      education: payload.education as string || null,
      cv_url: payload.cv_url as string || null,
      has_cv_profile: !!cvProfile,
    })

    payload.profile_complete_pct = percentage

    let error
    let newProfileId: string | null = null

    if (profile_id) {
      const result = await supabase
        .from('seeker_profiles')
        .update(payload)
        .eq('id', profile_id)
        .eq('user_id', user.id)
      error = result.error
    } else {
      const result = await supabase
        .from('seeker_profiles')
        .insert(payload)
        .select('id')
        .single()
      error = result.error
      if (result.data) {
        newProfileId = result.data.id
      }
    }

    if (error) {
      console.error('Profile save error:', error)
      return NextResponse.json(
        { error: 'Failed to save profile' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      profile_id: newProfileId || profile_id,
    })
  } catch (err) {
    console.error('Profile API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
