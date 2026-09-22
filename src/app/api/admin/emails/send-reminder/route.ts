import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendReminder } from '@/lib/reminder-outbox'
import { requireVerifiedUser } from '@/lib/api-auth'

/**
 * POST /api/admin/emails/send-reminder
 * Manually send a signup reminder to a specific unverified user.
 * Body: { auth_user_id: string, email: string, drip_step: number }
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

  const body = await request.json()
  const { auth_user_id, email, drip_step } = body

  if (!auth_user_id || !email || !drip_step) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const emailType = `signup_reminder_${drip_step}` as string
  if (drip_step < 1 || drip_step > 3) {
    return NextResponse.json({ error: 'Invalid drip step (1-3)' }, { status: 400 })
  }

  // Check if this drip was already sent
  const { data: existing } = await supabase
    .from('signup_reminder_log')
    .select('id')
    .eq('auth_user_id', auth_user_id)
    .eq('drip_step', drip_step)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'This reminder was already sent' }, { status: 409 })
  }

  try {
    const { data: recipient, error } = await supabase.auth.admin.getUserById(auth_user_id)
    if (error || recipient.user?.email !== email) return NextResponse.json({ error: 'Recipient mismatch' }, { status: 400 })
    const sent = await sendReminder(supabase, { userId: auth_user_id, to: email, type: emailType })
    if (!sent) return NextResponse.json({ error: 'Already sent or queued' }, { status: 409 })
  } catch {
    return NextResponse.json({ error: 'Delivery failed; queued for retry' }, { status: 503 })
  }

  return NextResponse.json({ success: true, email, drip_step })
}
