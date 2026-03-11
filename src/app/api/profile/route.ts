import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    const payload = {
      user_id: user.id,
      first_name: profileData.first_name,
      last_name: profileData.last_name,
      phone: profileData.phone,
      location: profileData.location,
      bio: profileData.bio,
      skills: profileData.skills,
      experience_years: profileData.experience_years,
      education: profileData.education,
      cv_url: profileData.cv_url,
      avatar_url: profileData.avatar_url,
      visibility: profileData.visibility,
      profile_complete_pct: profileData.profile_complete_pct,
      updated_at: new Date().toISOString(),
    }

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
        { error: error.message || 'Failed to save profile' },
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
