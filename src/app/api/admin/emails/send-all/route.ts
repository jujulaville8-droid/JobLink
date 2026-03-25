import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { requireVerifiedUser } from '@/lib/api-auth'

const DRIP_CONFIG = [
  { step: 1, delayHours: 24, emailType: 'signup_reminder_1' },
  { step: 2, delayHours: 72, emailType: 'signup_reminder_2' },
  { step: 3, delayHours: 168, emailType: 'signup_reminder_3' },
] as const

/**
 * POST /api/admin/emails/send-all
 * Trigger all pending signup reminders at once (same logic as cron, admin-triggered).
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

  // List unverified auth users
  const unverifiedUsers: { id: string; email: string; created_at: string }[] = []
  let page = 1
  const perPage = 1000

  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    })

    if (error) {
      return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
    }

    for (const u of users) {
      if (!u.email_confirmed_at && u.email && u.created_at) {
        unverifiedUsers.push({ id: u.id, email: u.email, created_at: u.created_at })
      }
    }

    if (users.length < perPage) break
    page++
  }

  if (unverifiedUsers.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No pending reminders' })
  }

  const userIds = unverifiedUsers.map((u) => u.id)
  const { data: existingLogs } = await supabase
    .from('signup_reminder_log')
    .select('auth_user_id, drip_step')
    .in('auth_user_id', userIds)

  const maxDripSent = new Map<string, number>()
  for (const log of existingLogs ?? []) {
    const current = maxDripSent.get(log.auth_user_id) ?? 0
    if (log.drip_step > current) {
      maxDripSent.set(log.auth_user_id, log.drip_step)
    }
  }

  const now = Date.now()
  let totalSent = 0

  for (const u of unverifiedUsers) {
    const hoursSinceSignup = (now - new Date(u.created_at).getTime()) / (1000 * 60 * 60)
    const lastDripSent = maxDripSent.get(u.id) ?? 0

    for (const drip of DRIP_CONFIG) {
      if (drip.step <= lastDripSent) continue
      if (hoursSinceSignup < drip.delayHours) break

      await sendEmail({ to: u.email, type: drip.emailType, data: {} })

      await supabase.from('signup_reminder_log').insert({
        auth_user_id: u.id,
        email: u.email,
        drip_step: drip.step,
      })

      totalSent++
      break
    }
  }

  return NextResponse.json({ sent: totalSent })
}
