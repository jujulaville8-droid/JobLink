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
      .select('role, is_banned')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (userData.is_banned) {
      return NextResponse.json({ error: 'Account is banned' }, { status: 403 })
    }

    // Enforce email verification
    if (!user.email_confirmed_at) {
      return NextResponse.json({ error: 'Please verify your email before applying' }, { status: 403 })
    }

    if (userData.role !== 'seeker') {
      return NextResponse.json({ error: 'Only job seekers can apply' }, { status: 403 })
    }

    // Get seeker profile
    const { data: seekerProfile, error: profileError } = await supabase
      .from('seeker_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (profileError || !seekerProfile) {
      return NextResponse.json(
        { error: 'Seeker profile not found. Please complete your profile first.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { job_id, cover_letter_text } = body

    if (!job_id) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    }

    // Check the job exists and is active
    const { data: job, error: jobError } = await supabase
      .from('job_listings')
      .select('id, status, company_id')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job listing not found' }, { status: 404 })
    }

    if (job.status !== 'active') {
      return NextResponse.json({ error: 'This job is no longer accepting applications' }, { status: 400 })
    }

    // Prevent self-application: check if the user owns the company that posted this job
    const { data: ownedCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('id', job.company_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (ownedCompany) {
      return NextResponse.json({ error: 'You cannot apply to your own company\'s listings' }, { status: 403 })
    }

    // Insert application (unique constraint on job_id + seeker_id will catch duplicates)
    const { data: application, error: insertError } = await supabase
      .from('applications')
      .insert({
        job_id,
        seeker_id: seekerProfile.id,
        cover_letter_text: cover_letter_text || '',
        status: 'applied',
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'You have already applied to this job' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
    }

    return NextResponse.json({ success: true, application }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
