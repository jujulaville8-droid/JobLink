import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import outreachData from './outreach-data.json'

// ─── Config ──────────────────────────────────────────────────────────────────

const FROM_ADDRESS = 'JobLinks <hello@joblinkantigua.com>'
const SIGNUP_URL = 'https://joblinkantigua.com/signup?role=employer'
const CALENDLY_URL = 'https://calendly.com/joblink-anu/ecom'
const RATE_LIMIT_MS = 100 // Resend premium — faster sends

interface Employer {
  company_name: string
  sector: string
  location: string
  website: string
  phone: string
  email: string
  email1_already_sent?: boolean
}

// ─── Email wrapper (matches existing JobLinks branding) ─────────────────────

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #ffffff; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; overflow: hidden;">
    <div style="background-color: #0d7377; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">JobLinks</h1>
    </div>
    <div style="padding: 32px 24px;">
      ${content}
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
}

// ─── Email Templates ────────────────────────────────────────────────────────

function buildEmail1(companyName: string): { subject: string; html: string } {
  return {
    subject: `${companyName}, something new for Antigua businesses`,
    html: emailWrapper(`
      <p style="color: #374151; line-height: 1.6; font-size: 15px;">Hi there,</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">
        I'm reaching out to local businesses in Antigua and <strong>${companyName}</strong> stood out as a business we'd love to have on our platform.
      </p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">
        We just launched <strong style="color: #0d7377;">JobLinks</strong> &mdash; Antigua &amp; Barbuda's own job platform, built specifically for local businesses like yours. Whether you're hiring now or might need someone down the road, your free employer profile puts you in front of hundreds of active job seekers across the island.
      </p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">Here's what you get <strong>for free</strong>:</p>
      <div style="background-color: #f0fafa; border-radius: 10px; padding: 20px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #0d7377; font-size: 16px;">&check;</td><td style="padding: 8px 0; color: #374151; font-size: 14px; line-height: 1.5;">A company profile page with your logo, description, and location</td></tr>
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #0d7377; font-size: 16px;">&check;</td><td style="padding: 8px 0; color: #374151; font-size: 14px; line-height: 1.5;">Post a job listing whenever you need staff &mdash; reaches job seekers island-wide</td></tr>
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #0d7377; font-size: 16px;">&check;</td><td style="padding: 8px 0; color: #374151; font-size: 14px; line-height: 1.5;">Instant notifications when someone applies</td></tr>
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #0d7377; font-size: 16px;">&check;</td><td style="padding: 8px 0; color: #374151; font-size: 14px; line-height: 1.5;">A dashboard to review applicants, shortlist, and manage everything in one place</td></tr>
        </table>
      </div>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">
        It takes about 2 minutes to set up. No credit card, no commitment &mdash; and it's there for you whenever you need it.
      </p>
      <p style="text-align: center; margin-top: 28px;">
        <a href="${SIGNUP_URL}" style="background-color: #0d7377; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 700; display: inline-block; font-size: 15px;">Create Your Free Employer Account</a>
      </p>
      <div style="background-color: #f9fafb; border-radius: 10px; padding: 16px 20px; margin: 24px 0; text-align: center;">
        <p style="color: #374151; font-size: 14px; margin: 0 0 8px 0;"><strong>Want a quick walkthrough?</strong> Book a free 15-minute demo and we'll show you around.</p>
        <a href="${CALENDLY_URL}" style="color: #0d7377; font-size: 14px; text-decoration: none; font-weight: 600;">Book a Demo Call &rarr;</a>
      </div>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">If you have any questions, just reply to this email &mdash; I'm happy to help you get set up.</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 24px;">
        Wishing you all the best,<br><strong>Julian</strong><br><span style="color: #6b7280; font-size: 14px;">JobLinks Antigua</span>
      </p>
    `),
  }
}

function buildEmail2(companyName: string, signupCount: number): { subject: string; html: string } {
  return {
    subject: `${signupCount} Antigua businesses joined this week — here's what makes JobLinks different`,
    html: emailWrapper(`
      <p style="color: #374151; line-height: 1.6; font-size: 15px;">Hi there,</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">
        Quick follow-up from my last email &mdash; <strong style="color: #0d7377;">${signupCount} local businesses</strong> across Antigua have already created their employer profiles on JobLinks since we launched.
      </p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">I wanted to share a few things that make JobLinks different from posting on Facebook or using overseas job sites:</p>
      <div style="margin: 20px 0;">
        <div style="background-color: #f0fafa; border-left: 4px solid #0d7377; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 12px;">
          <p style="color: #0d7377; margin: 0 0 4px 0; font-weight: 700; font-size: 14px;">Built for Antigua, not the world</p>
          <p style="color: #374151; margin: 0; font-size: 13px; line-height: 1.5;">Every feature is designed around how Antiguans actually work &mdash; seasonal and part-time toggles for the tourism industry, work permit filters, and a mobile-first design.</p>
        </div>
        <div style="background-color: #f0fafa; border-left: 4px solid #0d7377; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 12px;">
          <p style="color: #0d7377; margin: 0 0 4px 0; font-weight: 700; font-size: 14px;">One-click applications</p>
          <p style="color: #374151; margin: 0; font-size: 13px; line-height: 1.5;">Job seekers build a profile once and apply to your listing in one click &mdash; with their CV, skills, and experience all attached.</p>
        </div>
        <div style="background-color: #f0fafa; border-left: 4px solid #0d7377; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 12px;">
          <p style="color: #0d7377; margin: 0 0 4px 0; font-weight: 700; font-size: 14px;">WhatsApp-ready sharing</p>
          <p style="color: #374151; margin: 0; font-size: 13px; line-height: 1.5;">Share your job listing straight to WhatsApp with a clean link and preview. In Antigua, that's how things spread.</p>
        </div>
        <div style="background-color: #f0fafa; border-left: 4px solid #0d7377; padding: 14px 18px; border-radius: 0 8px 8px 0;">
          <p style="color: #0d7377; margin: 0 0 4px 0; font-weight: 700; font-size: 14px;">Real applicant tracking</p>
          <p style="color: #374151; margin: 0; font-size: 13px; line-height: 1.5;">Shortlist, reject, schedule interviews, and message candidates &mdash; all from one dashboard.</p>
        </div>
      </div>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 20px;">We'd love to have <strong>${companyName}</strong> on the platform. Your account is free and ready whenever you are.</p>
      <p style="text-align: center; margin-top: 28px;">
        <a href="${SIGNUP_URL}" style="background-color: #0d7377; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 700; display: inline-block; font-size: 15px;">Set Up Your Free Profile</a>
      </p>
      <div style="background-color: #f9fafb; border-radius: 10px; padding: 16px 20px; margin: 24px 0; text-align: center;">
        <p style="color: #374151; font-size: 14px; margin: 0 0 8px 0;"><strong>Prefer a walkthrough?</strong> Book a free demo and we'll get you set up in minutes.</p>
        <a href="${CALENDLY_URL}" style="color: #0d7377; font-size: 14px; text-decoration: none; font-weight: 600;">Book a Demo Call &rarr;</a>
      </div>
      <p style="color: #6b7280; font-size: 14px; margin-top: 20px; text-align: center;">Free forever. Post when you're ready.</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 24px;">Best,<br><strong>Julian</strong><br><span style="color: #6b7280; font-size: 14px;">JobLinks Antigua</span></p>
    `),
  }
}

function buildEmail3(companyName: string, location: string): { subject: string; html: string } {
  return {
    subject: `Last chance: exclusive perks for early ${companyName} signup`,
    html: emailWrapper(`
      <p style="color: #374151; line-height: 1.6; font-size: 15px;">Hi there,</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">This is my last email about this &mdash; I don't want to be in your inbox if it's not useful.</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">But before I go: we're offering something exclusive to the <strong style="color: #0d7377;">first 50 employers</strong> who create a profile on JobLinks.</p>
      <div style="background: linear-gradient(135deg, #062829 0%, #0d7377 100%); border-radius: 12px; padding: 24px; margin: 20px 0; color: white;">
        <p style="font-weight: 700; font-size: 16px; margin: 0 0 16px 0; color: #ffffff;">Your Early Adopter Perks:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #5eead4; font-size: 18px;">&starf;</td><td style="padding: 8px 0; color: #e5e7eb; font-size: 14px; line-height: 1.5;"><strong style="color: #ffffff;">Verified Employer</strong> badge on your company profile</td></tr>
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #5eead4; font-size: 18px;">&starf;</td><td style="padding: 8px 0; color: #e5e7eb; font-size: 14px; line-height: 1.5;">Your first job listing <strong style="color: #ffffff;">featured on the homepage</strong></td></tr>
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #5eead4; font-size: 18px;">&starf;</td><td style="padding: 8px 0; color: #e5e7eb; font-size: 14px; line-height: 1.5;"><strong style="color: #ffffff;">Priority support</strong> &mdash; we'll personally help set up your profile</td></tr>
          <tr><td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px; color: #5eead4; font-size: 18px;">&starf;</td><td style="padding: 8px 0; color: #e5e7eb; font-size: 14px; line-height: 1.5;"><strong style="color: #ffffff;">Direct messaging</strong> &mdash; message candidates right on the platform</td></tr>
        </table>
      </div>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;">
        I'm reaching out to <strong>${companyName}</strong> specifically because you're an established business in <strong>${location}</strong> and having you on the platform makes the whole community stronger.
      </p>
      <p style="text-align: center; margin-top: 28px;">
        <a href="${SIGNUP_URL}" style="background-color: #0d7377; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 700; display: inline-block; font-size: 15px;">Claim Your Spot &mdash; It's Free</a>
      </p>
      <div style="background-color: #f9fafb; border-radius: 10px; padding: 16px 20px; margin: 20px 0; text-align: center;">
        <p style="color: #374151; font-size: 14px; margin: 0 0 8px 0;"><strong>Want us to walk you through it?</strong> Book a free demo — takes 15 minutes.</p>
        <a href="${CALENDLY_URL}" style="color: #0d7377; font-size: 14px; text-decoration: none; font-weight: 600;">Book a Demo Call &rarr;</a>
      </div>
      <p style="color: #6b7280; font-size: 13px; margin-top: 16px; text-align: center;">Limited to the first 50 employers. No credit card required.</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 24px;">Thanks for your time, and all the best with <strong>${companyName}</strong>.</p>
      <p style="color: #374151; line-height: 1.6; font-size: 15px; margin-top: 16px;"><strong>Julian</strong><br><span style="color: #6b7280; font-size: 14px;">JobLinks Antigua</span></p>
    `),
  }
}

// ─── Helper: delay ──────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { secret, email, signupCount = 5, dryRun = false } = body

    // Auth via secret key (for automated calls without user session)
    const expectedSecret = process.env.OUTREACH_SECRET
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate params
    if (![1, 2, 3].includes(email)) {
      return NextResponse.json({ error: 'email must be 1, 2, or 3' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey && !dryRun) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    const resend = apiKey ? new Resend(apiKey) : null

    // Determine recipients
    const employers = outreachData as Employer[]
    let recipients: Employer[]

    if (email === 1) {
      // Email 1: skip employers who were already sent Email 1
      recipients = employers.filter(emp => !emp.email1_already_sent)
    } else {
      // Emails 2 & 3: send to ALL employers
      recipients = employers
    }

    const results: { company: string; email: string; status: string; error?: string }[] = []
    let sentCount = 0
    let failCount = 0

    for (const emp of recipients) {
      // Build email content
      let emailContent: { subject: string; html: string }
      if (email === 1) {
        emailContent = buildEmail1(emp.company_name)
      } else if (email === 2) {
        emailContent = buildEmail2(emp.company_name, signupCount)
      } else {
        emailContent = buildEmail3(emp.company_name, emp.location || 'Antigua')
      }

      if (dryRun) {
        results.push({ company: emp.company_name, email: emp.email, status: 'dry_run' })
        sentCount++
        continue
      }

      try {
        const { error: sendError } = await resend!.emails.send({
          from: FROM_ADDRESS,
          to: emp.email,
          subject: emailContent.subject,
          html: emailContent.html,
          replyTo: 'hello@joblinkantigua.com',
        })

        if (sendError) {
          failCount++
          results.push({ company: emp.company_name, email: emp.email, status: 'failed', error: sendError.message })
        } else {
          sentCount++
          results.push({ company: emp.company_name, email: emp.email, status: 'sent' })
        }
      } catch (err) {
        failCount++
        results.push({ company: emp.company_name, email: emp.email, status: 'failed', error: String(err) })
      }

      // Rate limiting
      await delay(RATE_LIMIT_MS)
    }

    return NextResponse.json({
      summary: {
        emailNumber: email,
        totalRecipients: recipients.length,
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
