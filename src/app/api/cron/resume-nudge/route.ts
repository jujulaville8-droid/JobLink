import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'

/**
 * Resume Nudge Cron Job (2-step drip)
 *
 * Drip 1: 24 hours after signup, if no resume → send first nudge
 * Drip 2: 5 days after first nudge, if still no resume → send second nudge
 *
 * Protected by CRON_SECRET. Runs daily at 10am via Vercel Cron.
 */

export async function GET(request: NextRequest) {
  // Vercel Cron sends this header automatically
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  // Also allow manual trigger with CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    const oneDayAgo = new Date()
    oneDayAgo.setDate(oneDayAgo.getDate() - 1)

    // Find all seekers who signed up 24h+ ago — filter empty/null cv_url in JS
    // (some profiles store "" instead of null for missing CV)
    const { data: allSeekers, error: seekerError } = await supabase
      .from('seeker_profiles')
      .select('user_id, first_name, cv_url')
      .lt('created_at', oneDayAgo.toISOString())

    const seekers = (allSeekers ?? []).filter((s) => !s.cv_url)

    if (seekerError) {
      console.error('[resume-nudge] Failed to fetch seekers:', seekerError)
      return NextResponse.json({ error: 'Failed to fetch seekers' }, { status: 500 })
    }

    if (seekers.length === 0) {
      return NextResponse.json({ sent_drip1: 0, sent_drip2: 0, message: 'No seekers to nudge' })
    }

    const userIds = seekers.map((s) => s.user_id)

    // Filter out seekers who have a built resume
    const { data: cvProfiles } = await supabase
      .from('cv_profiles')
      .select('user_id')
      .in('user_id', userIds)

    const hasBuiltResume = new Set((cvProfiles ?? []).map((c) => c.user_id))

    // Get all nudge events for these users
    const { data: nudgeEvents } = await supabase
      .from('cv_events')
      .select('user_id, event_type, created_at')
      .in('event_type', ['resume_nudge_sent', 'resume_nudge_2_sent'])
      .in('user_id', userIds)

    // Build lookup: user_id → { drip1_sent_at, drip2_sent }
    const nudgeMap = new Map<string, { drip1_at: string | null; drip2_sent: boolean }>()
    for (const event of nudgeEvents ?? []) {
      const existing = nudgeMap.get(event.user_id) ?? { drip1_at: null, drip2_sent: false }
      if (event.event_type === 'resume_nudge_sent') {
        existing.drip1_at = event.created_at
      }
      if (event.event_type === 'resume_nudge_2_sent') {
        existing.drip2_sent = true
      }
      nudgeMap.set(event.user_id, existing)
    }

    // Get emails
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .in('id', userIds)

    const emailMap = new Map((users ?? []).map((u) => [u.id, u.email]))

    let sentDrip1 = 0
    let sentDrip2 = 0
    const fiveDaysAgo = new Date()
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

    for (const seeker of seekers) {
      if (hasBuiltResume.has(seeker.user_id)) continue

      const email = emailMap.get(seeker.user_id)
      if (!email) continue

      const nudges = nudgeMap.get(seeker.user_id)

      // Drip 1: Never been nudged
      if (!nudges?.drip1_at) {
        await sendEmail({
          to: email,
          type: 'resume_nudge',
          data: { applicant_name: seeker.first_name || undefined },
        })
        await supabase.from('cv_events').insert({
          user_id: seeker.user_id,
          event_type: 'resume_nudge_sent',
          metadata: { email },
        })
        sentDrip1++
        continue
      }

      // Drip 2: First nudge was 5+ days ago, second not yet sent
      if (nudges.drip1_at && !nudges.drip2_sent) {
        const drip1Date = new Date(nudges.drip1_at)
        if (drip1Date <= fiveDaysAgo) {
          await sendEmail({
            to: email,
            type: 'resume_nudge_2',
            data: { applicant_name: seeker.first_name || undefined },
          })
          await supabase.from('cv_events').insert({
            user_id: seeker.user_id,
            event_type: 'resume_nudge_2_sent',
            metadata: { email },
          })
          sentDrip2++
        }
      }
    }

    console.log(`[resume-nudge] Drip 1: ${sentDrip1}, Drip 2: ${sentDrip2}`)
    return NextResponse.json({ sent_drip1: sentDrip1, sent_drip2: sentDrip2 })
  } catch (err) {
    console.error('[resume-nudge] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
