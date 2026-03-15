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

    // Enforce email verification
    if (!user.email_confirmed_at) {
      return NextResponse.json({ error: 'Please verify your email first' }, { status: 403 })
    }

    const body = await request.json()
    const { job_id, reason } = body

    if (!job_id) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }

    // Use admin client for DB operations (RLS may block reported_listings access)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminClient = createAdminClient()

    // Verify the job exists
    const { data: job, error: jobError } = await adminClient
      .from('job_listings')
      .select('id')
      .eq('id', job_id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job listing not found' }, { status: 404 })
    }

    // Prevent duplicate reports from the same user
    const { data: existingReport } = await adminClient
      .from('reported_listings')
      .select('id')
      .eq('job_id', job_id)
      .eq('reported_by', user.id)
      .maybeSingle()

    if (existingReport) {
      return NextResponse.json({ error: 'You have already reported this listing' }, { status: 409 })
    }

    // Insert report
    const { data: report, error: insertError } = await adminClient
      .from('reported_listings')
      .insert({
        job_id,
        reported_by: user.id,
        reason: reason.trim(),
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 })
    }

    return NextResponse.json({ success: true, report }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
