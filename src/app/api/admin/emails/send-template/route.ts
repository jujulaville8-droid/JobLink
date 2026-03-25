import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { requireVerifiedUser } from '@/lib/api-auth'

/**
 * POST /api/admin/emails/send-template
 * Send any email template to a specific email address.
 * Body: { to: string, type: string, data: Record<string, unknown> }
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
  const { to, type, data } = body

  if (!to || !type) {
    return NextResponse.json({ error: 'Missing "to" or "type"' }, { status: 400 })
  }

  // Basic email validation
  if (!to.includes('@')) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  await sendEmail({ to, type, data: data || {} })

  return NextResponse.json({ success: true, to, type })
}
