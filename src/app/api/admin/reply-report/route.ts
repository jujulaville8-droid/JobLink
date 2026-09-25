import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireVerifiedUser } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user } = auth

    // Verify the server-managed admin flag.
    const admin = createAdminClient()
    const { data: userData } = await admin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!userData?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { to, job_title, message } = await request.json()

    if (!to || !message) {
      return NextResponse.json({ error: 'to and message are required' }, { status: 400 })
    }

    await sendEmail({
      to,
      type: 'report_response',
      data: {
        job_title,
        admin_message: message,
      },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
