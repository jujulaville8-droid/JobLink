import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Look up existing conversation for an application
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const applicationId = request.nextUrl.searchParams.get('application_id')
    if (!applicationId) {
      return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
    }

    // Verify the user is part of this application (seeker or employer)
    const { data: app } = await supabase
      .from('applications')
      .select(`
        id,
        seeker_profiles!inner ( user_id ),
        job_listings!inner ( companies!inner ( user_id ) )
      `)
      .eq('id', applicationId)
      .single()

    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const seeker = app.seeker_profiles as unknown as { user_id: string }
    const company = app.job_listings as unknown as { companies: { user_id: string } }

    if (user.id !== seeker.user_id && user.id !== company.companies.user_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Look up conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('application_id', applicationId)
      .single()

    return NextResponse.json({ conversation_id: conversation?.id || null })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
