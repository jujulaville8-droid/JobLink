import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildEmailHtml } from '@/lib/email-templates'
import { BASE_URL } from '@/lib/email'
import { requireVerifiedUser } from '@/lib/api-auth'

const FROM_ADDRESS = 'JobLinks <notifications@joblinkantigua.com>'

/**
 * POST /api/admin/emails/notify-seekers
 * Re-send the "new job posted" notification to all verified seekers for a specific job.
 * Uses Resend batch API to send up to 100 emails per API call.
 * Body: { job_id: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  const { user } = auth

  const supabase = createAdminClient()

  // Verify admin
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!userData?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { job_id } = await request.json()
  if (!job_id) {
    return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })
  }

  // Get full job details
  const { data: job } = await supabase
    .from('job_listings')
    .select('title, description, location, job_type, salary_min, salary_max, salary_visible, companies(company_name)')
    .eq('id', job_id)
    .single()

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const company = Array.isArray(job.companies) ? job.companies[0] : job.companies
  const companyName = company?.company_name || 'An employer'
  const listingUrl = `${BASE_URL}/jobs/${job_id}`

  // Format salary
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

  // Get all verified seekers
  const { data: seekerUsers } = await supabase
    .from('users')
    .select('id, email')
    .eq('role', 'seeker')
    .eq('email_verified', true)

  if (!seekerUsers || seekerUsers.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No verified seekers found' })
  }

  // Get seeker first names
  const seekerIds = seekerUsers.map(s => s.id)
  const { data: seekerProfiles } = await supabase
    .from('seeker_profiles')
    .select('user_id, first_name')
    .in('user_id', seekerIds)

  const nameMap: Record<string, string> = {}
  if (seekerProfiles) {
    for (const p of seekerProfiles) {
      if (p.first_name) nameMap[p.user_id] = p.first_name
    }
  }

  // Build all emails and send via Resend batch API (up to 100 per call)
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const resend = new Resend(apiKey)
  const seekersWithEmail = seekerUsers.filter(s => s.email)
  let sent = 0

  // Build personalized email payloads
  const allEmails = seekersWithEmail.map(seeker => {
    const { subject, html } = buildEmailHtml('new_job_posted', {
      seeker_name: nameMap[seeker.id] || '',
      job_title: job.title,
      company_name: companyName,
      job_location: job.location || '',
      job_type_label: jobTypeLabel,
      salary_range: salaryRange,
      job_description_preview: descPreview,
      listing_url: listingUrl,
    })
    return { from: FROM_ADDRESS, to: seeker.email, subject, html }
  })

  // Send in batches of 100 via batch API
  for (let i = 0; i < allEmails.length; i += 100) {
    const batch = allEmails.slice(i, i + 100)
    try {
      await resend.batch.send(batch)
      sent += batch.length
    } catch (err) {
      console.error(`[notify-seekers] Batch ${i / 100 + 1} failed:`, err)
    }
  }

  return NextResponse.json({ sent, job_title: job.title })
}
