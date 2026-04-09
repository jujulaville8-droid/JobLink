import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  // Simple secret so only your agent can call this
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.AGENT_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { business_name, email, role, source_url, email_html } = await req.json()

  if (!business_name || !email || !role || !email_html) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Check if contacted in last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: existing } = await supabase
    .from('outreach_log')
    .select('id')
    .eq('email', email)
    .gte('contacted_at', thirtyDaysAgo.toISOString())
    .single()

  if (existing) {
    return NextResponse.json({
      skipped: true,
      reason: 'Contacted within last 30 days'
    })
  }

  // Send via Resend
  const { error: sendError } = await resend.emails.send({
    from: 'JobLinks Antigua <team@joblinkantigua.com>',
    to: email,
    subject: `Post your ${role} vacancy on JobLinks Antigua — it's free`,
    html: email_html
  })

  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 })
  }

  // Log the outreach
  await supabase.from('outreach_log').insert({
    business_name,
    email,
    role_hiring_for: role,
    source_url
  })

  return NextResponse.json({ success: true })
}
