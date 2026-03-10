import { NextRequest, NextResponse } from 'next/server'

const FROM_ADDRESS = 'JobLink <notifications@joblink.ag>'

type EmailType =
  | 'application_confirmation'
  | 'new_applicant'
  | 'status_update'
  | 'job_alert'
  | 'listing_expiry'

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
        <div style="background-color: #1e3a5f; padding: 24px; text-align: center;">
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

  switch (type) {
    case 'application_confirmation':
      return {
        subject: `Application submitted: ${data.job_title}`,
        html: wrapper(`
          <h2 style="color: #1e3a5f; margin-top: 0;">Application Submitted</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your application for <strong>${data.job_title}</strong> at <strong>${data.company_name}</strong> has been submitted successfully.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            The employer will review your application and get back to you. You can track your application status from your dashboard.
          </p>
          ${data.dashboard_url ? `<p style="margin-top: 24px;"><a href="${data.dashboard_url}" style="background-color: #e85d26; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Dashboard</a></p>` : ''}
        `),
      }

    case 'new_applicant':
      return {
        subject: `New applicant for ${data.job_title}`,
        html: wrapper(`
          <h2 style="color: #1e3a5f; margin-top: 0;">New Application Received</h2>
          <p style="color: #374151; line-height: 1.6;">
            <strong>${data.applicant_name}</strong> has applied for the position of <strong>${data.job_title}</strong>.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Log in to your dashboard to review the application and manage candidates.
          </p>
          ${data.application_url ? `<p style="margin-top: 24px;"><a href="${data.application_url}" style="background-color: #e85d26; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Review Application</a></p>` : ''}
        `),
      }

    case 'status_update':
      return {
        subject: `Application update: ${data.job_title}`,
        html: wrapper(`
          <h2 style="color: #1e3a5f; margin-top: 0;">Application Status Update</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your application for <strong>${data.job_title}</strong> at <strong>${data.company_name}</strong> has been updated.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            New status: <strong style="color: #e85d26;">${data.status}</strong>
          </p>
          ${data.dashboard_url ? `<p style="margin-top: 24px;"><a href="${data.dashboard_url}" style="background-color: #e85d26; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Details</a></p>` : ''}
        `),
      }

    case 'job_alert':
      return {
        subject: 'New jobs matching your alert',
        html: wrapper(`
          <h2 style="color: #1e3a5f; margin-top: 0;">New Job Matches</h2>
          <p style="color: #374151; line-height: 1.6;">
            We found new jobs matching your alert preferences:
          </p>
          ${
            data.jobs
              ?.map(
                (job) => `
              <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                <h3 style="color: #1e3a5f; margin: 0 0 4px 0; font-size: 16px;">${job.title}</h3>
                <p style="color: #6b7280; margin: 0; font-size: 14px;">${job.company}</p>
                ${job.url ? `<a href="${job.url}" style="color: #e85d26; font-size: 14px; text-decoration: none; font-weight: 600;">View Job &rarr;</a>` : ''}
              </div>
            `
              )
              .join('') || '<p style="color: #6b7280;">No jobs to display.</p>'
          }
        `),
      }

    case 'listing_expiry':
      return {
        subject: `Your listing is expiring: ${data.listing_title}`,
        html: wrapper(`
          <h2 style="color: #1e3a5f; margin-top: 0;">Listing Expiring Soon</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your job listing <strong>${data.listing_title}</strong> is set to expire on <strong>${data.expires_at}</strong>.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Log in to your dashboard to renew or extend the listing if you are still hiring.
          </p>
          ${data.dashboard_url ? `<p style="margin-top: 24px;"><a href="${data.dashboard_url}" style="background-color: #e85d26; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Manage Listing</a></p>` : ''}
        `),
      }

    default:
      return {
        subject: 'Notification from JobLink',
        html: wrapper(`<p style="color: #374151;">You have a new notification from JobLink.</p>`),
      }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, type } = body

    if (!to || !type) {
      return NextResponse.json({ error: 'to and type are required' }, { status: 400 })
    }

    // Email sending disabled until Resend API key is configured
    console.log(`[Email Disabled] Would send "${type}" email to ${to}`)
    return NextResponse.json({ success: true, id: 'email-disabled', message: 'Email sending not yet configured' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
