type EmailType =
  | 'application_confirmation'
  | 'new_applicant'
  | 'status_update'
  | 'job_alert'
  | 'listing_expiry'
  | 'listing_approved'
  | 'listing_rejected'
  | 'new_message'
  | 'report_response'

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
  admin_message?: string
}

/** Escape HTML entities to prevent XSS in email content */
function esc(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildEmailHtml(type: string, data: Record<string, unknown>): { subject: string; html: string } {
  const d = data as unknown as EmailData
  const emailType = type as EmailType

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
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">JobLinks</h1>
        </div>
        <div style="padding: 32px 24px;">
          ${content}
        </div>
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">JobLinks &mdash; Antigua &amp; Barbuda's Job Platform</p>
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
    interview: { text: 'Interview', color: '#059669' },
    rejected: { text: 'Not Selected', color: '#dc2626' },
    hold: { text: 'On Hold', color: '#0d7377' },
  }

  switch (emailType) {
    case 'application_confirmation':
      return {
        subject: `You applied for ${esc(d.job_title)} — we'll keep you posted`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Application Sent!</h2>
          <p style="color: #374151; line-height: 1.6;">
            Nice one — your application for <strong>${esc(d.job_title)}</strong> at <strong>${esc(d.company_name)}</strong> has been submitted.
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
        subject: `${esc(d.applicant_name)} just applied for ${esc(d.job_title)}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You Have a New Applicant</h2>
          <p style="color: #374151; line-height: 1.6;">
            <strong>${esc(d.applicant_name)}</strong> has applied for <strong>${esc(d.job_title)}</strong>. Their profile, CV, and cover letter are ready for you to review.
          </p>
          ${btn('Review Applicant', '/my-listings')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">Tip: Responding quickly helps you secure the best candidates before other employers do.</p>
        `),
      }

    case 'status_update': {
      const info = statusLabel[d.status || ''] || { text: d.status || 'Updated', color: '#14919b' }
      const isInterview = d.status === 'Interview'
      const isRejected = d.status === 'rejected' || d.status === 'Not Selected'
      const isHold = d.status === 'On Hold' || d.status === 'hold'
      return {
        subject: isInterview
          ? `Interview request for ${esc(d.job_title)}`
          : `Update on your application: ${esc(d.job_title)}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">${isInterview ? 'Interview Invitation' : 'Application Update'}</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your application for <strong>${esc(d.job_title)}</strong> at <strong>${esc(d.company_name)}</strong> has a new status:
          </p>
          <div style="background-color: ${info.color}10; border-left: 4px solid ${info.color}; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0;">
            <p style="color: ${info.color}; font-weight: 700; margin: 0; font-size: 16px;">${esc(info.text)}</p>
          </div>
          ${isInterview ? `<p style="color: #374151; line-height: 1.6;">The employer would like to interview you. Expect to hear from them shortly with details.</p>` : ''}
          ${isRejected ? `<p style="color: #374151; line-height: 1.6;">This one didn't work out, but don't let it stop you. There are more opportunities waiting on JobLinks.</p>` : ''}
          ${isHold ? `<p style="color: #374151; line-height: 1.6;">Your application is on hold. The employer may follow up with next steps.</p>` : ''}
          ${!isInterview && !isRejected && !isHold ? `<p style="color: #374151; line-height: 1.6;">The employer is moving forward with your application. Stay tuned for further updates.</p>` : ''}
          ${isRejected ? btn('Browse More Jobs', '/jobs') : btn('View My Applications', '/applications')}
        `),
      }
    }

    case 'job_alert':
      return {
        subject: `New jobs on JobLinks that match your alert`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Jobs Matching Your Alert</h2>
          <p style="color: #374151; line-height: 1.6;">
            Here are fresh opportunities that match what you're looking for:
          </p>
          ${
            d.jobs
              ?.map(
                (job) => `
              <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                <h3 style="color: #0d7377; margin: 0 0 4px 0; font-size: 16px;">${esc(job.title)}</h3>
                <p style="color: #6b7280; margin: 0; font-size: 14px;">${esc(job.company)}</p>
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
        subject: `Heads up: "${esc(d.listing_title)}" expires soon`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Your Listing Is Expiring</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your job listing <strong>${esc(d.listing_title)}</strong> expires on <strong>${esc(d.expires_at)}</strong>.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Still hiring? Repost or extend the listing from your dashboard to keep receiving applications.
          </p>
          ${btn('Manage My Listings', '/my-listings')}
        `),
      }

    case 'listing_approved':
      return {
        subject: `Your listing "${esc(d.listing_title)}" is now live!`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You're Live!</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your job listing <strong>${esc(d.listing_title)}</strong> has been approved and is now visible to job seekers across Antigua and Barbuda.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            You'll receive an email each time someone applies. You can also check applicants anytime from your dashboard.
          </p>
          ${btn('View My Listings', '/my-listings')}
        `),
      }

    case 'listing_rejected':
      return {
        subject: `Your listing "${esc(d.listing_title)}" needs changes`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Listing Needs Revision</h2>
          <p style="color: #374151; line-height: 1.6;">
            Your job listing <strong>${esc(d.listing_title)}</strong> wasn't approved this time. This is usually because of missing details or a content issue.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Please review it and resubmit. If you're unsure what to change, reply to this email and we'll help.
          </p>
          ${btn('Edit My Listings', '/my-listings')}
        `),
      }

    case 'report_response':
      return {
        subject: `Update on your report — ${esc(d.job_title)}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Report Update</h2>
          <p style="color: #374151; line-height: 1.6;">
            Thank you for reporting <strong>${esc(d.job_title)}</strong>. Our team has reviewed it and here's our response:
          </p>
          <div style="background-color: #f9fafb; border-left: 4px solid #0d7377; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0;">
            <p style="color: #374151; margin: 0; white-space: pre-wrap;">${esc(d.admin_message)}</p>
          </div>
          <p style="color: #374151; line-height: 1.6;">
            We appreciate you helping keep JobLinks safe and trustworthy for everyone.
          </p>
          ${btn('Browse Jobs', '/jobs')}
        `),
      }

    case 'new_message':
      return {
        subject: `New message from ${esc(d.sender_name)} about ${esc(d.job_title)}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You Have a New Message</h2>
          <p style="color: #374151; line-height: 1.6;">
            <strong>${esc(d.sender_name)}</strong> sent you a message about <strong>${esc(d.job_title)}</strong>:
          </p>
          <div style="background-color: #f9fafb; border-left: 4px solid #0d7377; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0;">
            <p style="color: #374151; margin: 0; font-style: italic;">"${esc(d.message_preview)}${(d.message_preview?.length || 0) >= 100 ? '...' : ''}"</p>
          </div>
          ${btn('View Conversation', '/messages')}
        `),
      }

    default:
      return {
        subject: 'Notification from JobLinks',
        html: wrapper(`
          <p style="color: #374151;">You have a new notification from JobLinks.</p>
          ${btn('Go to JobLinks', '/dashboard')}
        `),
      }
  }
}
