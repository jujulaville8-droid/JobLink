import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Lightweight application context for messaging header
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: app } = await supabase
      .from('applications')
      .select(`
        id,
        seeker_profiles!inner ( user_id, first_name, last_name ),
        job_listings!inner (
          title,
          companies!inner ( user_id, company_name )
        )
      `)
      .eq('id', applicationId)
      .single()

    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const seeker = app.seeker_profiles as unknown as { user_id: string; first_name: string; last_name: string }
    const job = app.job_listings as unknown as { title: string; companies: { user_id: string; company_name: string } }

    if (user.id !== seeker.user_id && user.id !== job.companies.user_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Return the "other" participant's name based on who's asking
    const otherName = user.id === seeker.user_id
      ? job.companies.company_name
      : `${seeker.first_name} ${seeker.last_name}`.trim()

    return NextResponse.json({
      job_title: job.title,
      company_name: job.companies.company_name,
      other_name: otherName,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
