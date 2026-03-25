import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildEmailHtml } from '@/lib/email-templates'
import { requireVerifiedUser } from '@/lib/api-auth'

const FROM_ADDRESS = 'JobLinks <notifications@joblinkantigua.com>'

/**
 * POST /api/admin/emails/resume-blast
 * Send the "resume importance" campaign email to all verified seekers
 * who don't have a resume (no uploaded CV and no built CV).
 */
export async function POST() {
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

  // Get all verified seekers
  const { data: seekerUsers } = await supabase
    .from('users')
    .select('id, email')
    .eq('role', 'seeker')
    .eq('email_verified', true)

  if (!seekerUsers || seekerUsers.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, message: 'No verified seekers found' })
  }

  const seekerIds = seekerUsers.map(s => s.id)

  // Get seeker profiles to check for uploaded CV and get first names
  const { data: seekerProfiles } = await supabase
    .from('seeker_profiles')
    .select('user_id, first_name, cv_url')
    .in('user_id', seekerIds)

  const profileMap = new Map<string, { first_name: string | null; cv_url: string | null }>()
  if (seekerProfiles) {
    for (const p of seekerProfiles) {
      profileMap.set(p.user_id, { first_name: p.first_name, cv_url: p.cv_url })
    }
  }

  // Check for built resumes
  const { data: cvProfiles } = await supabase
    .from('cv_profiles')
    .select('user_id')
    .in('user_id', seekerIds)

  const hasBuiltResume = new Set((cvProfiles ?? []).map(c => c.user_id))

  // Filter to seekers without any resume
  const seekersWithoutResume = seekerUsers.filter(s => {
    const profile = profileMap.get(s.id)
    const hasUploadedCV = profile?.cv_url && profile.cv_url.length > 0
    return !hasUploadedCV && !hasBuiltResume.has(s.id)
  })

  if (seekersWithoutResume.length === 0) {
    return NextResponse.json({ sent: 0, skipped: seekerUsers.length, message: 'All seekers already have a resume' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const resend = new Resend(apiKey)
  let sent = 0

  // Build personalized email payloads
  const allEmails = seekersWithoutResume
    .filter(s => s.email)
    .map(seeker => {
      const profile = profileMap.get(seeker.id)
      const { subject, html } = buildEmailHtml('resume_importance', {
        applicant_name: profile?.first_name || '',
      })
      return { from: FROM_ADDRESS, to: seeker.email, subject, html }
    })

  // Send in batches of 100 via Resend batch API
  for (let i = 0; i < allEmails.length; i += 100) {
    const batch = allEmails.slice(i, i + 100)
    try {
      await resend.batch.send(batch)
      sent += batch.length
    } catch (err) {
      console.error(`[resume-blast] Batch ${i / 100 + 1} failed:`, err)
    }
  }

  return NextResponse.json({
    sent,
    skipped: seekerUsers.length - seekersWithoutResume.length,
    total_seekers: seekerUsers.length,
  })
}
