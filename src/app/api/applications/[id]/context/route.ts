import { listingEmployerName } from '@/lib/confidential-employer'
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// GET: Lightweight application context for messaging header
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params
    const auth = await requireUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const { data: app } = await supabase
      .from('applications')
      .select(`
        id,
        seeker_profiles!inner ( user_id, first_name, last_name ),
        job_listings!inner (
          title, company_id, is_confidential,
          companies ( company_name )
        )
      `)
      .eq('id', applicationId)
      .single()

    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const seeker = app.seeker_profiles as unknown as { user_id: string; first_name: string; last_name: string }
    const job = app.job_listings as unknown as { title: string; company_id: string; is_confidential: boolean; companies: { company_name: string } | null }

    // The employer comes from company_owners, not companies: row security hides
    // a confidential employer's company row from the applicant, while this view
    // carries only the owner's id and is readable by both sides.
    const { data: owner } = await supabase
      .from('company_owners')
      .select('user_id')
      .eq('id', job.company_id)
      .maybeSingle()
    if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (user.id !== seeker.user_id && user.id !== owner.user_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Return the "other" participant's name based on who's asking
    // Only the employer sees their own name when they asked not to be named.
    const companyName = user.id === owner.user_id
      ? job.companies?.company_name || 'Employer'
      : listingEmployerName(job.is_confidential, job.companies)
    const otherName = user.id === seeker.user_id
      ? companyName
      : `${seeker.first_name} ${seeker.last_name}`.trim()

    return NextResponse.json({
      job_title: job.title,
      company_name: companyName,
      other_name: otherName,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
