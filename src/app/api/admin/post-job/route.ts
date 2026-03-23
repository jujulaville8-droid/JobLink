import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, BASE_URL } from '@/lib/email'

async function notifyJobSeekers(jobId: string) {
  try {
    const admin = createAdminClient()

    const { data: job } = await admin
      .from('job_listings')
      .select('title, description, location, job_type, salary_min, salary_max, salary_visible, companies(company_name)')
      .eq('id', jobId)
      .single()

    if (!job) return

    const company = Array.isArray(job.companies) ? job.companies[0] : job.companies
    const companyName = company?.company_name || 'An employer'
    const listingUrl = `${BASE_URL}/jobs/${jobId}`

    let salaryRange = ''
    if (job.salary_visible && (job.salary_min || job.salary_max)) {
      const fmt = (n: number) => n >= 1000 ? `EC$${(n / 1000).toFixed(0)}k` : `EC$${n}`
      if (job.salary_min && job.salary_max) salaryRange = `${fmt(job.salary_min)} – ${fmt(job.salary_max)}`
      else if (job.salary_min) salaryRange = `From ${fmt(job.salary_min)}`
      else if (job.salary_max) salaryRange = `Up to ${fmt(job.salary_max)}`
    }

    const jobTypeLabels: Record<string, string> = { full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract', seasonal: 'Seasonal' }
    const jobTypeLabel = jobTypeLabels[job.job_type] || job.job_type
    const descPreview = job.description ? job.description.slice(0, 200).replace(/\n/g, ' ') : ''

    const { data: seekerUsers } = await admin
      .from('users')
      .select('id, email')
      .eq('role', 'seeker')
      .eq('email_verified', true)

    if (!seekerUsers || seekerUsers.length === 0) return

    const seekerIds = seekerUsers.map((s: { id: string }) => s.id)
    const { data: seekerProfiles } = await admin
      .from('seeker_profiles')
      .select('user_id, first_name')
      .in('user_id', seekerIds)

    const nameMap: Record<string, string> = {}
    if (seekerProfiles) {
      for (const p of seekerProfiles as { user_id: string; first_name: string | null }[]) {
        if (p.first_name) nameMap[p.user_id] = p.first_name
      }
    }

    for (const seeker of seekerUsers as { id: string; email: string | null }[]) {
      if (seeker.email) {
        sendEmail({
          to: seeker.email,
          type: 'new_job_posted',
          data: {
            seeker_name: nameMap[seeker.id] || '',
            job_title: job.title,
            company_name: companyName,
            job_location: job.location || '',
            job_type_label: jobTypeLabel,
            salary_range: salaryRange,
            job_description_preview: descPreview,
            listing_url: listingUrl,
          },
        })
      }
    }
  } catch (err) {
    console.error('[notifyJobSeekers] Error:', err)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error

  const { user } = auth

  // Verify admin
  const admin = createAdminClient()
  const { data: userData } = await admin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!userData?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const {
    // Company
    company_id,
    new_company,
    // Job fields
    title,
    description,
    category,
    job_type,
    salary_min,
    salary_max,
    salary_visible,
    duration,
  } = body

  // Validate required job fields
  if (!title?.trim() || !description?.trim() || !category || !job_type) {
    return NextResponse.json({ error: 'Missing required job fields' }, { status: 400 })
  }

  let resolvedCompanyId: string = company_id

  // Create new company if needed
  if (!company_id && new_company) {
    if (!new_company.company_name?.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
    }

    const { data: created, error: companyError } = await admin
      .from('companies')
      .insert({
        user_id: user.id,
        company_name: new_company.company_name.trim(),
        industry: new_company.industry || null,
        location: new_company.location || null,
        website: new_company.website || null,
        description: new_company.description || null,
        is_verified: false,
        is_pro: false,
      })
      .select('id')
      .single()

    if (companyError || !created) {
      return NextResponse.json({ error: companyError?.message || 'Failed to create company' }, { status: 500 })
    }

    resolvedCompanyId = created.id
  }

  if (!resolvedCompanyId) {
    return NextResponse.json({ error: 'Company is required' }, { status: 400 })
  }

  // Calculate expiry
  let expiresAt: string | null = null
  if (duration && duration !== 'unlimited') {
    const d = new Date()
    d.setDate(d.getDate() + Number(duration))
    expiresAt = d.toISOString()
  }

  const { data: listing, error: listingError } = await admin
    .from('job_listings')
    .insert({
      company_id: resolvedCompanyId,
      title: title.trim(),
      description: description.trim(),
      category,
      job_type,
      salary_min: salary_min ? Number(salary_min) : null,
      salary_max: salary_max ? Number(salary_max) : null,
      salary_visible: salary_visible ?? true,
      requires_work_permit: false,
      status: 'active',
      posted_by_admin: true,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (listingError || !listing) {
    return NextResponse.json({ error: listingError?.message || 'Failed to create listing' }, { status: 500 })
  }

  // Fire-and-forget seeker notifications
  notifyJobSeekers(listing.id)

  return NextResponse.json({ success: true, listingId: listing.id, companyId: resolvedCompanyId })
}
