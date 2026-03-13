import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a seeker
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || !userData || userData.role !== 'seeker') {
      return NextResponse.json({ error: 'Only job seekers can save jobs' }, { status: 403 })
    }

    // Enforce email verification
    if (!user.email_confirmed_at) {
      return NextResponse.json({ error: 'Please verify your email first' }, { status: 403 })
    }

    // Get seeker profile
    const { data: seekerProfile, error: profileError } = await supabase
      .from('seeker_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (profileError || !seekerProfile) {
      return NextResponse.json({ error: 'Seeker profile not found' }, { status: 400 })
    }

    const body = await request.json()
    const { job_id } = body

    if (!job_id) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    }

    // Check if already saved
    const { data: existing } = await supabase
      .from('saved_jobs')
      .select('id')
      .eq('seeker_id', seekerProfile.id)
      .eq('job_id', job_id)
      .single()

    if (existing) {
      // Unsave
      await supabase
        .from('saved_jobs')
        .delete()
        .eq('id', existing.id)

      return NextResponse.json({ saved: false })
    }

    // Save
    const { error: insertError } = await supabase
      .from('saved_jobs')
      .insert({
        seeker_id: seekerProfile.id,
        job_id,
      })

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save job' }, { status: 500 })
    }

    return NextResponse.json({ saved: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
