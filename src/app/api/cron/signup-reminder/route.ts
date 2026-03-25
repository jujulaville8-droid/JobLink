import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'

/**
 * Signup Reminder Cron Job (3-step drip)
 *
 * Drip 1: 24 hours after signup, if email still unverified
 * Drip 2: 3 days after signup, if still unverified
 * Drip 3: 7 days after signup, if still unverified (final)
 *
 * Protected by CRON_SECRET. Runs daily at 10am via Vercel Cron.
 */

const DRIP_CONFIG = [
  { step: 1, delayHours: 24, emailType: 'signup_reminder_1' },
  { step: 2, delayHours: 72, emailType: 'signup_reminder_2' },
  { step: 3, delayHours: 168, emailType: 'signup_reminder_3' },
] as const

export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // List all auth users who haven't verified their email
    const unverifiedUsers: { id: string; email: string; created_at: string }[] = []
    let page = 1
    const perPage = 1000

    while (true) {
      const { data: { users }, error } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      })

      if (error) {
        console.error('[signup-reminder] Failed to list auth users:', error)
        return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
      }

      for (const user of users) {
        if (!user.email_confirmed_at && user.email && user.created_at) {
          unverifiedUsers.push({
            id: user.id,
            email: user.email,
            created_at: user.created_at,
          })
        }
      }

      if (users.length < perPage) break
      page++
    }

    if (unverifiedUsers.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No unverified users to remind' })
    }

    // Get existing reminder logs for these users
    const userIds = unverifiedUsers.map((u) => u.id)
    const { data: existingLogs } = await supabase
      .from('signup_reminder_log')
      .select('auth_user_id, drip_step')
      .in('auth_user_id', userIds)

    // Build lookup: auth_user_id → max drip_step sent
    const maxDripSent = new Map<string, number>()
    for (const log of existingLogs ?? []) {
      const current = maxDripSent.get(log.auth_user_id) ?? 0
      if (log.drip_step > current) {
        maxDripSent.set(log.auth_user_id, log.drip_step)
      }
    }

    const now = Date.now()
    let totalSent = 0
    const results: Record<string, number> = { drip1: 0, drip2: 0, drip3: 0 }

    for (const user of unverifiedUsers) {
      const hoursSinceSignup = (now - new Date(user.created_at).getTime()) / (1000 * 60 * 60)
      const lastDripSent = maxDripSent.get(user.id) ?? 0

      // Find the next drip to send
      for (const drip of DRIP_CONFIG) {
        if (drip.step <= lastDripSent) continue
        if (hoursSinceSignup < drip.delayHours) break

        await sendEmail({
          to: user.email,
          type: drip.emailType,
          data: {},
        })

        await supabase.from('signup_reminder_log').insert({
          auth_user_id: user.id,
          email: user.email,
          drip_step: drip.step,
        })

        results[`drip${drip.step}`]++
        totalSent++
        break // Only send one drip per run per user
      }
    }

    console.log(`[signup-reminder] Sent: ${JSON.stringify(results)}`)
    return NextResponse.json({ sent: totalSent, ...results })
  } catch (err) {
    console.error('[signup-reminder] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
