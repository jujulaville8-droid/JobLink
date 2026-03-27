import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const FROM_ADDRESS = 'JobLinks <hello@joblinkantigua.com>'
const RATE_LIMIT_MS = 100
const SITE = 'https://joblinkantigua.com'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function esc(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildThankYouEmail(name: string | null): { subject: string; html: string } {
  const greeting = name ? `Hi ${esc(name)},` : 'Hi there,'
  const subject = name
    ? `${name}, thank you for joining JobLinks`
    : 'Thank you for joining JobLinks'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background-color: #0d7377; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">JobLinks</h1>
    </div>
    <div style="padding: 32px 24px;">
      <p style="color: #374151; line-height: 1.6; font-size: 15px;">${greeting}</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">
        Just wanted to say a quick thank you for signing up on <strong style="color: #0d7377;">JobLinks</strong>. You're one of the first people on the platform and that genuinely means a lot.
      </p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">
        We built JobLinks because Antigua needed something better than scrolling through outdated business directories or hoping the right person sees your Facebook post. This isn't a list of phone numbers and addresses. It's an actual platform where employers post real jobs and job seekers apply with real profiles, CVs, and qualifications. Everything in one place, built specifically for how we do things here.
      </p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">
        The thing is, a platform like this really only works when more people know about it. If you're looking for work, chances are you know someone else who is too. And if you're hiring, you probably know another business owner who's tired of the same old ways of finding staff and could use something that actually works.
      </p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">
        Spreading the word, whether that's a WhatsApp message or just bringing it up in conversation, honestly makes all the difference right now. The more job seekers on the platform, the more useful it is for employers. The more employers posting, the more useful it is for job seekers. It all feeds into itself, and it starts with people like you telling one or two people.
      </p>

      <p style="text-align: center; margin-top: 28px;">
        <a href="${SITE}" style="background-color: #0d7377; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 700; display: inline-block; font-size: 15px;">Visit JobLinks</a>
      </p>

      <div style="background-color: #f0fafa; border-radius: 10px; padding: 20px; margin: 24px 0;">
        <p style="color: #0d7377; font-weight: 700; font-size: 15px; margin: 0 0 8px 0;">We want to hear from you</p>
        <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0;">
          We're still in the early days, which means now is the best time to shape the platform. If there's something you wish the site could do, something that would make your experience better, or even just a rough idea, reply directly to this email. I read every single one.
        </p>
      </div>

      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">This is your platform. Help us make it what Antigua deserves.</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 24px;">
        All the best,<br><strong>Julian</strong><br><span style="color: #6b7280; font-size: 14px;">JobLinks Antigua</span>
      </p>
    </div>
    <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 12px; margin: 0;">JobLinks &mdash; Antigua &amp; Barbuda's Job Platform</p>
      <p style="color: #9ca3af; font-size: 11px; margin-top: 4px;">
        Don't want emails from us? <a href="#" style="color: #9ca3af;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}

/**
 * POST /api/admin/emails/thank-you
 * Send branded thank-you email to all registered users.
 * Body: { secret: string, dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { secret, dryRun = false } = body

    const expectedSecret = process.env.OUTREACH_SECRET
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey && !dryRun) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    const resend = apiKey ? new Resend(apiKey) : null
    const supabase = createAdminClient()

    // Fetch all verified users with their emails
    const allUsers: { id: string; email: string; role: string }[] = []
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
        if (u.email_confirmed_at && u.email) {
          allUsers.push({ id: u.id, email: u.email, role: '' })
        }
      }

      if (users.length < perPage) break
      page++
    }

    if (allUsers.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No verified users found' })
    }

    // Get user roles
    const userIds = allUsers.map((u) => u.id)
    const { data: userRows } = await supabase
      .from('users')
      .select('id, role')
      .in('id', userIds)

    const roleMap = new Map<string, string>()
    for (const row of userRows ?? []) {
      roleMap.set(row.id, row.role)
    }

    // Get seeker names
    const { data: seekerProfiles } = await supabase
      .from('seeker_profiles')
      .select('user_id, first_name')
      .in('user_id', userIds)

    const seekerNameMap = new Map<string, string>()
    for (const sp of seekerProfiles ?? []) {
      if (sp.first_name) seekerNameMap.set(sp.user_id, sp.first_name)
    }

    // Get company names
    const { data: companies } = await supabase
      .from('companies')
      .select('user_id, company_name')
      .in('user_id', userIds)

    const companyNameMap = new Map<string, string>()
    for (const c of companies ?? []) {
      if (c.company_name) companyNameMap.set(c.user_id, c.company_name)
    }

    // Send emails
    const results: { email: string; name: string | null; status: string; error?: string }[] = []
    let sentCount = 0
    let failCount = 0

    for (const u of allUsers) {
      const role = roleMap.get(u.id) || 'seeker'
      const name = role === 'employer'
        ? companyNameMap.get(u.id) || null
        : seekerNameMap.get(u.id) || null

      const { subject, html } = buildThankYouEmail(name)

      if (dryRun) {
        results.push({ email: u.email, name, status: 'dry_run' })
        sentCount++
        continue
      }

      try {
        const { error: sendError } = await resend!.emails.send({
          from: FROM_ADDRESS,
          to: u.email,
          subject,
          html,
          replyTo: 'hello@joblinkantigua.com',
        })

        if (sendError) {
          failCount++
          results.push({ email: u.email, name, status: 'failed', error: sendError.message })
        } else {
          sentCount++
          results.push({ email: u.email, name, status: 'sent' })
        }
      } catch (err) {
        failCount++
        results.push({ email: u.email, name, status: 'failed', error: String(err) })
      }

      await delay(RATE_LIMIT_MS)
    }

    return NextResponse.json({
      summary: {
        totalUsers: allUsers.length,
        sent: sentCount,
        failed: failCount,
        dryRun,
      },
      results,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
