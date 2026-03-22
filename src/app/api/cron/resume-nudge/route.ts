import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'

/**
 * Resume Nudge Cron Job
 *
 * Finds seekers who:
 * 1. Signed up more than 24 hours ago
 * 2. Have no uploaded resume (cv_url is null)
 * 3. Have no built resume (no cv_profiles row)
 * 4. Haven't already been sent a nudge email
 *
 * Sends them a single nudge email encouraging them to add a resume.
 * Protected by a CRON_SECRET header to prevent unauthorized access.
 *
 * Set up as a Vercel Cron Job or call manually:
 *   curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://joblinkantigua.com/api/cron/resume-nudge
 */

const MAX_EMAILS_PER_RUN = 50

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    const oneDayAgo = new Date()
    oneDayAgo.setDate(oneDayAgo.getDate() - 1)

    // Find seekers without a resume who signed up more than 24h ago
    const { data: seekers, error: seekerError } = await supabase
      .from('seeker_profiles')
      .select('user_id, first_name, cv_url')
      .is('cv_url', null)
      .lt('created_at', oneDayAgo.toISOString())
      .limit(MAX_EMAILS_PER_RUN * 2) // Fetch extra since some may have built resumes

    if (seekerError || !seekers) {
      console.error('[resume-nudge] Failed to fetch seekers:', seekerError)
      return NextResponse.json({ error: 'Failed to fetch seekers' }, { status: 500 })
    }

    if (seekers.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No seekers to nudge' })
    }

    // Filter out seekers who have a built resume
    const userIds = seekers.map((s) => s.user_id)
    const { data: cvProfiles } = await supabase
      .from('cv_profiles')
      .select('user_id')
      .in('user_id', userIds)

    const hasBuiltResume = new Set((cvProfiles ?? []).map((c) => c.user_id))

    // Filter out seekers who already received a nudge email
    const { data: alreadyNudged } = await supabase
      .from('cv_events')
      .select('user_id')
      .eq('event_type', 'resume_nudge_sent')
      .in('user_id', userIds)

    const alreadySent = new Set((alreadyNudged ?? []).map((n) => n.user_id))

    // Get eligible seekers
    const eligible = seekers.filter(
      (s) => !hasBuiltResume.has(s.user_id) && !alreadySent.has(s.user_id)
    )

    if (eligible.length === 0) {
      return NextResponse.json({ sent: 0, message: 'All seekers already have a resume or were nudged' })
    }

    // Get emails for eligible seekers
    const eligibleIds = eligible.slice(0, MAX_EMAILS_PER_RUN).map((s) => s.user_id)
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .in('id', eligibleIds)

    const emailMap = new Map((users ?? []).map((u) => [u.id, u.email]))

    let sent = 0
    for (const seeker of eligible.slice(0, MAX_EMAILS_PER_RUN)) {
      const email = emailMap.get(seeker.user_id)
      if (!email) continue

      await sendEmail({
        to: email,
        type: 'resume_nudge',
        data: { applicant_name: seeker.first_name || undefined },
      })

      // Record that we sent the nudge so we don't send it again
      await supabase.from('cv_events').insert({
        user_id: seeker.user_id,
        event_type: 'resume_nudge_sent',
        metadata: { email },
      })

      sent++
    }

    console.log(`[resume-nudge] Sent ${sent} nudge emails`)
    return NextResponse.json({ sent, total_eligible: eligible.length })
  } catch (err) {
    console.error('[resume-nudge] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
