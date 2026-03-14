import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const FROM_ADDRESS = 'JobLink <notifications@joblinkantigua.com>'

type EmailType =
  | 'application_confirmation'
  | 'new_applicant'
  | 'status_update'
  | 'job_alert'
  | 'listing_expiry'
  | 'listing_approved'
  | 'listing_rejected'
  | 'new_message'

interface EmailData {
  applicant_name?: string
  job_title?: string
  company_name?: string
  status?: string
  jobs?: { title: string; company: string; url: string }[]
  listing_title?: string
  expires_at?: string
  application_url?: string
  dashboard_url?: string
  sender_name?: string
  message_preview?: string
}

function buildEmailHtml(type: EmailType, data: EmailData): { subject: string; html: string } {
  const wrapper = (content: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background-color: #0d7377; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">JobLink</h1>
        </div>
        <div style="padding: 32px 24px;">
          ${content}
        </div>
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">JobLink &mdash; Antigua &amp; Barbuda's Job Platform</p>
        </div>
      </div>
    </body>
    </html>
  `

  const SITE = 'https://joblinkantigua.com'
  const btnStyle = 'background-color: #14919b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;'
  const btn = (label: string, path: string) =>
    `<p style="margin-top: 24px;"><a href="${SITE}${path}" style="${btnStyle}">${label}</a></p>`

  const statusLabel: Record<string, { text: string; color: string }> = {
    shortlisted: { text: 'Shortlisted', color: '#059669' },
    rejected: { text: 'Not Selected', color: '#dc2626' },
    hired: { text: 'Hired', color: '#0d7377' },
  }

  switch (type) {
    case 'application_confirmation':
      return {
        subject: `You applied for ${data.job_title} — we'll keep you posted`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Application Sent!</h2>
          <p style="color: #374151; line-height: 1.6;">
            Nice one — your application for <strong>${data.job_title}</strong> at <strong>${data.company_name}</strong> has been submitted.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            The employer will review it and you'll get an email as soon as your status changes. In the meantime, you can track everything from your dashboard.
          </p>
          ${btn('View My Applications', '/applications')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">Keep applying — the more you put out, the better your chances.</p>
        `),
      }

    case 'new_applicant':
      return {
        subject: `${data.applicant_name} just applied for ${data.job_title}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You Have a New Applicant</h2>
          <p style="color: #374151; line-height: 1.6;">
            <strong>${data.applicant_name}</strong> has applied for <strong>${data.job_title}</strong>. Their profile, CV, and cover letter are ready for you to review.
          </p>
          ${btn('Review Applicant', '/my-listings')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">Tip: Responding quickly helps you secure the best candidates before other employers do.</p>
        `),
      }

    case 'status_update': {
      const info = statusLabel[data.status || ''] || { text: data.status || 'Updated', color: '#14919b' }
      const isHired = data.status === 'hired'
      const isRejected = data.status === 'rejected'
      return {
        subject: isHired
          ? `Congratulations! You got the job: ${data.job_title}`
          : `Update on your application: ${data.job_title}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">${isHired ? 'Congratulations!' : 'Application Update'}</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your application for <strong>${data.job_title}</strong> at <strong>${data.company_name}</strong> has a new status:
          </p>
          <div style="background-color: ${info.color}10; border-left: 4px solid ${info.color}; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0;">
            <p style="color: ${info.color}; font-weight: 700; margin: 0; font-size: 16px;">${info.text}</p>
          </div>
          ${isHired ? `<p style="color: #374151; line-height: 1.6;">The employer has selected you for the role. Expect to hear from them shortly about next steps.</p>` : ''}
          ${isRejected ? `<p style="color: #374151; line-height: 1.6;">This one didn't work out, but don't let it stop you. There are more opportunities waiting on JobLink.</p>` : ''}
          ${!isHired && !isRejected ? `<p style="color: #374151; line-height: 1.6;">The employer is moving forward with your application. Stay tuned for further updates.</p>` : ''}
          ${isRejected ? btn('Browse More Jobs', '/jobs') : btn('View My Applications', '/applications')}
        `),
      }
    }

    case 'job_alert':
      return {
        subject: `New jobs on JobLink that match your alert`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Jobs Matching Your Alert</h2>
          <p style="color: #374151; line-height: 1.6;">
            Here are fresh opportunities that match what you're looking for:
          </p>
          ${
            data.jobs
              ?.map(
                (job) => `
              <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                <h3 style="color: #0d7377; margin: 0 0 4px 0; font-size: 16px;">${job.title}</h3>
                <p style="color: #6b7280; margin: 0; font-size: 14px;">${job.company}</p>
                <a href="${job.url || `${SITE}/jobs`}" style="color: #14919b; font-size: 14px; text-decoration: none; font-weight: 600; margin-top: 8px; display: inline-block;">View &amp; Apply &rarr;</a>
              </div>
            `
              )
              .join('') || '<p style="color: #6b7280;">No jobs to display.</p>'
          }
          ${btn('Browse All Jobs', '/jobs')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 16px;">You can manage your alerts from your dashboard settings.</p>
        `),
      }

    case 'listing_expiry':
      return {
        subject: `Heads up: "${data.listing_title}" expires soon`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Your Listing Is Expiring</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your job listing <strong>${data.listing_title}</strong> expires on <strong>${data.expires_at}</strong>.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Still hiring? Repost or extend the listing from your dashboard to keep receiving applications.
          </p>
          ${btn('Manage My Listings', '/my-listings')}
        `),
      }

    case 'listing_approved':
      return {
        subject: `Your listing "${data.listing_title}" is now live!`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You're Live!</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your job listing <strong>${data.listing_title}</strong> has been approved and is now visible to job seekers across Antigua and Barbuda.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            You'll receive an email each time someone applies. You can also check applicants anytime from your dashboard.
          </p>
          ${btn('View My Listings', '/my-listings')}
        `),
      }

    case 'listing_rejected':
      return {
        subject: `Your listing "${data.listing_title}" needs changes`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Listing Needs Revision</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your job listing <strong>${data.listing_title}</strong> wasn't approved this time. This is usually because of missing details or a content issue.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Please review it and resubmit. If you're unsure what to change, reply to this email and we'll help.
          </p>
          ${btn('Edit My Listings', '/my-listings')}
        `),
      }

    case 'new_message':
      return {
        subject: `New message from ${data.sender_name} about ${data.job_title}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You Have a New Message</h2>
          <p style="color: #374151; line-height: 1.6;">
            <strong>${data.sender_name}</strong> sent you a message about <strong>${data.job_title}</strong>:
          </p>
          <div style="background-color: #f9fafb; border-left: 4px solid #0d7377; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0;">
            <p style="color: #374151; margin: 0; font-style: italic;">"${data.message_preview}${(data.message_preview?.length || 0) >= 100 ? '...' : ''}"</p>
          </div>
          ${btn('View Conversation', '/messages')}
        `),
      }

    default:
      return {
        subject: 'Notification from JobLink',
        html: wrapper(`
          <p style="color: #374151;">You have a new notification from JobLink.</p>
          ${btn('Go to JobLink', '/dashboard')}
        `),
      }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, type, data } = body as { to: string; type: EmailType; data?: EmailData }

    if (!to || !type) {
      return NextResponse.json({ error: 'to and type are required' }, { status: 400 })
    }

    const { subject, html } = buildEmailHtml(type, data || {})

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn(`[Email] RESEND_API_KEY not set — skipping "${type}" email to ${to}`)
      return NextResponse.json({ success: true, id: 'no-api-key', message: 'RESEND_API_KEY not configured' })
    }

    const resend = new Resend(apiKey)

    const { data: result, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    })

    if (error) {
      console.error(`[Email] Failed to send "${type}" to ${to}:`, error)
      return NextResponse.json({ error: 'Failed to send email', details: error.message }, { status: 500 })
    }

    console.log(`[Email] Sent "${type}" to ${to} — id: ${result?.id}`)
    return NextResponse.json({ success: true, id: result?.id })
  } catch (err) {
    console.error('[Email] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
