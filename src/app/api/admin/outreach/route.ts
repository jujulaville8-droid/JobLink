import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import outreachData from './outreach-data.json'
import { outreachProof } from '@/lib/testimonials'
import { insertProof, escapeHtml } from '@/lib/testimonial-content'
import { PILOT_URL } from '@/lib/employer-pilot'
import { TEAM_INBOX } from '@/lib/team-inbox'

// ─── Config ──────────────────────────────────────────────────────────────────

const FROM_ADDRESS = 'JobLinks <hello@joblinkantigua.com>'
const HELP_URL = `${PILOT_URL}?source=employer-outreach`
const RATE_LIMIT_MS = 100 // Resend premium — faster sends
/**
 * Recipients per invocation. At RATE_LIMIT_MS plus Resend's own latency this
 * keeps a run comfortably inside maxDuration; the caller resumes with the
 * `next_offset` from the response.
 */
const MAX_PER_INVOCATION = 100

// Bulk sending needs more than the default function timeout.
export const maxDuration = 300

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
        Don't want emails from us?
        <a href="mailto:${TEAM_INBOX}?subject=Unsubscribe" style="color: #9ca3af;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

// ─── Email Templates ────────────────────────────────────────────────────────

function buildPilotEmail(companyName: string, emailNumber: number): { subject: string; html: string } {
  const company = escapeHtml(companyName)
  const subjects = ['Can we help with your next vacancy?', 'Still looking for staff?', 'Hiring help, whenever you need it']
  const introductions = [
    'I’m Julian, the founder of JobLinks Antigua. I’m opening a hands-on hiring pilot for local employers.',
    'A quick follow-up: if you have a vacancy to fill, I’d be happy to discuss how JobLinks can help.',
    'I’ll leave this with you for now. If you need help with a vacancy, you can send it over when the timing is right.',
  ]
  return {
    subject: subjects[emailNumber - 1],
    html: emailWrapper('<p>Hi there,</p><p>' + introductions[emailNumber - 1] + '</p><p>For ' + company + ', our free first-vacancy pilot includes help preparing the advert, reaching relevant job seekers and checking applications against the requirements we agree with you.</p><p>No account is needed to request help. We’ll confirm the role and whether the pilot is a fit before we start, and agree the details with you before publishing.</p><p><a href="' + HELP_URL + '" style="display:inline-block;padding:14px 24px;background:#0d7377;color:white;border-radius:8px;text-decoration:none;font-weight:bold">Send us your vacancy</a></p><p>You can also reply with your existing advert or tell me what has been difficult about filling the role.</p><p>Best,<br>Julian<br>JobLinks Antigua</p>'),
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
    const {
      secret,
      email,
      dryRun = false,
      offset = 0,
      batchSize = MAX_PER_INVOCATION,
    } = body

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

    // A single invocation must finish inside the function timeout. Sending all
    // 382 recipients sequentially took longer than any serverless limit allows,
    // so the run is chunked and the caller walks `next_offset` to completion.
    const totalRecipients = recipients.length
    const start = Math.max(0, Number(offset) || 0)
    const size = Math.min(Math.max(1, Number(batchSize) || MAX_PER_INVOCATION), MAX_PER_INVOCATION)
    const batch = recipients.slice(start, start + size)
    const nextOffset = start + batch.length < totalRecipients ? start + batch.length : null

    const results: { company: string; email: string; status: string; error?: string }[] = []
    let sentCount = 0
    let failCount = 0

    for (const emp of batch) {
      // Build email content
      const emailContent = buildPilotEmail(emp.company_name, email)

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
          html: insertProof(emailContent.html, await outreachProof()),
          replyTo: TEAM_INBOX,
          // The footer link alone was href="#", which is a dead unsubscribe on
          // cold outreach. These headers give mail clients a real one.
          headers: {
            'List-Unsubscribe': `<mailto:${TEAM_INBOX}?subject=Unsubscribe>`,
          },
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
        totalRecipients,
        batchStart: start,
        batchSize: batch.length,
        sent: sentCount,
        failed: failCount,
        dryRun,
      },
      // Non-null when more recipients remain: call again with this as `offset`.
      next_offset: nextOffset,
      complete: nextOffset === null,
      results,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
