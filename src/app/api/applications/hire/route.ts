import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, BASE_URL } from '@/lib/email'
import { sendStatusChangeMessage } from '@/lib/messaging-system-messages'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { application_id, close_job } = await request.json()

    if (!application_id) {
      return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
    }

    // Get the application
    const { data: application } = await supabase
      .from('applications')
      .select('id, job_id, seeker_id')
      .eq('id', application_id)
      .single()

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // Get listing and verify ownership
    const { data: listing } = await supabase
      .from('job_listings')
      .select('id, company_id, title, companies(company_name)')
      .eq('id', application.job_id)
      .single()

    if (!listing) {
      return NextResponse.json({ error: 'Job listing not found' }, { status: 404 })
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', listing.company_id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update application status to hired
    await supabase
      .from('applications')
      .update({ status: 'hired' })
      .eq('id', application_id)

    // Optionally close the job listing
    if (close_job) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const adminClient = createAdminClient()
      await adminClient
        .from('job_listings')
        .update({ status: 'closed' })
        .eq('id', application.job_id)
    }

    // Send notifications
    const { data: seekerProfile } = await supabase
      .from('seeker_profiles')
      .select('user_id')
      .eq('id', application.seeker_id)
      .single()

    if (seekerProfile?.user_id) {
      const { data: seekerUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', seekerProfile.user_id)
        .single()

      if (seekerUser?.email) {
        const companyData = Array.isArray(listing.companies) ? listing.companies[0] : listing.companies
        sendEmail({
          to: seekerUser.email,
          type: 'status_update',
          data: {
            job_title: listing.title,
            company_name: companyData?.company_name || 'the employer',
            status: 'Hired',
            dashboard_url: `${BASE_URL}/applications`,
          },
        })
      }

      const companyData = Array.isArray(listing.companies) ? listing.companies[0] : listing.companies
      sendStatusChangeMessage(supabase, {
        applicationId: application_id,
        employerUserId: user.id,
        seekerUserId: seekerProfile.user_id,
        newStatus: 'hired',
        jobTitle: listing.title,
        companyName: companyData?.company_name || 'the employer',
      })
    }

    return NextResponse.json({ success: true, closed: !!close_job })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
