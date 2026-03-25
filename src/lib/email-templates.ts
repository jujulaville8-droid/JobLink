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
  | 'job_invite'
  | 'new_job_posted'
  | 'resume_nudge'
  | 'resume_nudge_2'
  | 'resume_importance'
  | 'signup_reminder_1'
  | 'signup_reminder_2'
  | 'signup_reminder_3'

interface EmailData {
  applicant_name?: string
  job_title?: string
  company_name?: string
  status?: string
  jobs?: { title: string; company: string; url: string }[]
  listing_title?: string
  listing_url?: string
  expires_at?: string
  seeker_name?: string
  job_location?: string
  job_type_label?: string
  salary_range?: string
  job_description_preview?: string
  application_url?: string
  dashboard_url?: string
  sender_name?: string
  message_preview?: string
  admin_message?: string
  rejection_reason?: string
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
            Your job listing <strong>${esc(d.listing_title)}</strong> wasn't approved this time.
          </p>
          ${d.rejection_reason ? `
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0;">
            <p style="color: #92400e; margin: 0 0 4px 0; font-weight: 600; font-size: 13px;">Reason:</p>
            <p style="color: #78350f; margin: 0; white-space: pre-wrap;">${esc(d.rejection_reason)}</p>
          </div>
          ` : `
          <p style="color: #374151; line-height: 1.6;">
            This is usually because of missing details or a content issue.
          </p>
          `}
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

    case 'new_job_posted':
      return {
        subject: `${esc(d.company_name)} is hiring: ${esc(d.job_title)}`,
        html: wrapper(`
          <p style="color: #374151; line-height: 1.6; font-size: 15px;">
            Hi ${esc(d.seeker_name) || 'there'},
          </p>
          <p style="color: #374151; line-height: 1.6; font-size: 15px;">
            <strong>${esc(d.company_name)}</strong> just posted a new opportunity for a <strong>${esc(d.job_title)}</strong>${d.job_location ? ` in ${esc(d.job_location)}` : ''}. If you're interested, apply today or learn more about the position below.
          </p>

          ${d.listing_url ? `
          <div style="text-align: center; margin: 24px 0;">
            <a href="${d.listing_url}" style="display: inline-block; background-color: #0d7377; color: #ffffff; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">View Job</a>
          </div>
          ` : ''}

          <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin: 24px 0;">
            <div style="padding: 20px;">
              <h3 style="color: #1a1a1a; margin: 0 0 4px 0; font-size: 17px; font-weight: 700;">${esc(d.job_title)}</h3>
              <p style="color: #0d7377; margin: 0 0 2px 0; font-size: 14px; font-weight: 600;">${esc(d.company_name)}</p>
              ${d.job_location ? `<p style="color: #6b7280; margin: 0; font-size: 13px;">${esc(d.job_location)}</p>` : ''}
            </div>

            ${d.salary_range || d.job_type_label ? `
            <div style="border-top: 1px solid #e5e7eb; padding: 16px 20px;">
              ${d.salary_range ? `
              <div style="margin-bottom: ${d.job_type_label ? '10px' : '0'};">
                <p style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 2px 0;">Salary</p>
                <p style="color: #1a1a1a; font-size: 14px; font-weight: 600; margin: 0;">${esc(d.salary_range)}</p>
              </div>
              ` : ''}
              ${d.job_type_label ? `
              <div>
                <p style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 2px 0;">Job Type</p>
                <p style="color: #1a1a1a; font-size: 14px; font-weight: 600; margin: 0;">${esc(d.job_type_label)}</p>
              </div>
              ` : ''}
            </div>
            ` : ''}

            ${d.job_description_preview ? `
            <div style="border-top: 1px solid #e5e7eb; padding: 16px 20px;">
              <p style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px 0;">Job Description</p>
              <p style="color: #374151; font-size: 13px; line-height: 1.5; margin: 0;">${esc(d.job_description_preview)}...</p>
              ${d.listing_url ? `<a href="${d.listing_url}" style="color: #0d7377; font-size: 13px; text-decoration: none; font-weight: 600; margin-top: 8px; display: inline-block;">Learn more</a>` : ''}
            </div>
            ` : ''}
          </div>

          <div style="background-color: #f9fafb; border-radius: 10px; padding: 16px 20px; margin: 24px 0; text-align: center;">
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px 0;">Keep your JobLinks profile up to date</p>
            <a href="${SITE}/profile" style="color: #0d7377; font-size: 13px; text-decoration: none; font-weight: 600;">Edit profile</a>
          </div>
        `),
      }

    case 'job_invite':
      return {
        subject: `${esc(d.company_name)} invited you to apply for "${esc(d.job_title)}"`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You've Been Invited to Apply!</h2>
          <p style="color: #374151; line-height: 1.6;">
            Great news — <strong>${esc(d.company_name)}</strong> has reviewed your profile and thinks you'd be a great fit for their <strong>${esc(d.job_title)}</strong> position.
          </p>
          <div style="background-color: #f0fafa; border-left: 4px solid #0d7377; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0;">
            <p style="color: #374151; margin: 0; font-style: italic;">"${esc(d.message_preview)}${(d.message_preview?.length || 0) >= 100 ? '...' : ''}"</p>
          </div>
          <p style="color: #374151; line-height: 1.6;">
            View the listing and apply directly — the employer is waiting to hear from you.
          </p>
          ${d.listing_url ? btn('View Job & Apply', d.listing_url) : btn('View Messages', '/messages')}
        `),
      }

    case 'resume_nudge':
      return {
        subject: `${esc(d.applicant_name) || 'Hey'}, employers are looking for candidates like you`,
        html: wrapper(`
          <h2 style="color: #1f2937; margin: 0 0 8px;">You're almost there, ${esc(d.applicant_name) || 'there'}!</h2>
          <p style="color: #374151; line-height: 1.6;">
            You signed up for JobLinks — great first step! But we noticed you haven't added a resume to your profile yet.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Employers across Antigua &amp; Barbuda are actively searching for candidates right now.
            Profiles with a resume are <strong>3x more likely</strong> to get contacted by employers.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            You can upload a resume you already have, or build one right on JobLinks in just a few minutes.
          </p>
          <div style="margin: 24px 0; text-align: center;">
            ${btn('Upload My Resume', '/profile')}
          </div>
          <p style="text-align: center; margin-top: 12px;">
            <a href="${SITE}/profile/cv" style="color: #14919b; font-size: 14px; text-decoration: underline;">Or build one using our Resume Builder</a>
          </p>
        `),
      }

    case 'resume_nudge_2':
      return {
        subject: `${esc(d.applicant_name) || 'Hey'}, don't miss out — employers are hiring now`,
        html: wrapper(`
          <h2 style="color: #1f2937; margin: 0 0 8px;">Quick reminder, ${esc(d.applicant_name) || 'there'}!</h2>
          <p style="color: #374151; line-height: 1.6;">
            We noticed you still haven't added a resume to your JobLinks profile. That's okay — it only takes a couple of minutes.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Right now, there are employers in Antigua &amp; Barbuda actively looking for candidates.
            Without a resume, your profile won't show up in their search results.
          </p>
          <p style="color: #374151; line-height: 1.6; font-weight: 600;">
            Two easy options:
          </p>
          <ul style="color: #374151; line-height: 1.8; padding-left: 20px;">
            <li><strong>Upload</strong> a resume you already have (PDF)</li>
            <li><strong>Build one</strong> on JobLinks in under 3 minutes</li>
          </ul>
          <div style="margin: 24px 0; text-align: center;">
            ${btn('Add My Resume Now', '/profile')}
          </div>
          <p style="text-align: center; margin-top: 12px;">
            <a href="${SITE}/profile/cv" style="color: #14919b; font-size: 14px; text-decoration: underline;">Or use our free Resume Builder</a>
          </p>
        `),
      }

    case 'resume_importance':
      return {
        subject: `${esc(d.applicant_name) || 'Hey'}, your resume could be the reason an employer reaches out`,
        html: wrapper(`
          <h2 style="color: #1f2937; margin: 0 0 8px;">Your Resume Matters More Than You Think</h2>
          <p style="color: #374151; line-height: 1.6; font-size: 15px;">
            Hi ${esc(d.applicant_name) || 'there'},
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Here's something most people don't realise: <strong>employers on JobLinks are browsing profiles every single day</strong> — even when they haven't posted a job yet. They're searching for the right person before they ever publish a listing.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            If your profile doesn't have a resume, you're invisible to them. It's that simple.
          </p>

          <div style="background-color: #fef9ec; border-left: 4px solid #e8973e; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
            <p style="color: #92400e; font-weight: 700; margin: 0 0 8px 0; font-size: 15px;">Why a resume is essential:</p>
            <ul style="color: #78350f; margin: 0; padding-left: 18px; line-height: 2;">
              <li>Employers actively search public profiles — <strong>even when no jobs are posted</strong></li>
              <li>A resume is the first thing they look at when deciding who to contact</li>
              <li>Profiles with a resume are far more likely to receive direct invitations</li>
              <li>Without one, your profile won't appear in employer search results</li>
            </ul>
          </div>

          <p style="color: #374151; line-height: 1.6;">
            You don't need a perfect resume. You just need one. Whether you have experience or you're just starting out, having something there tells employers you're serious and ready to work.
          </p>

          <p style="color: #374151; line-height: 1.6; font-weight: 600;">
            You have two easy options:
          </p>

          <div style="display: flex; gap: 12px; margin: 24px 0;">
            <div style="flex: 1; background-color: #f0fafa; border-radius: 12px; padding: 20px; text-align: center;">
              <p style="color: #0d7377; font-weight: 700; margin: 0 0 6px 0; font-size: 15px;">Upload Your Resume</p>
              <p style="color: #6b7280; font-size: 13px; margin: 0 0 12px 0;">Already have a CV? Upload it in seconds.</p>
              <a href="${SITE}/profile" style="display: inline-block; background-color: #0d7377; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Upload Now</a>
            </div>
            <div style="flex: 1; background-color: #f0fafa; border-radius: 12px; padding: 20px; text-align: center;">
              <p style="color: #0d7377; font-weight: 700; margin: 0 0 6px 0; font-size: 15px;">Build One on JobLinks</p>
              <p style="color: #6b7280; font-size: 13px; margin: 0 0 12px 0;">No resume? Build a professional one for free.</p>
              <a href="${SITE}/profile/cv" style="display: inline-block; background-color: #14919b; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Build My Resume</a>
            </div>
          </div>

          <p style="color: #374151; line-height: 1.6;">
            The job market in Antigua &amp; Barbuda moves fast. Don't wait for a job to be posted — make sure employers can find <strong>you</strong> first.
          </p>

          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">Every day without a resume is a missed opportunity. Take 3 minutes and add yours today.</p>
        `),
      }

    case 'signup_reminder_1':
      return {
        subject: `Don't forget to verify your JobLinks account`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">One Step Left!</h2>
          <p style="color: #374151; line-height: 1.6;">
            You recently signed up for JobLinks — Antigua &amp; Barbuda's job platform — but you haven't verified your email yet.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Without verifying, you won't be able to browse jobs, apply, or set up your profile. It only takes a second.
          </p>
          ${btn('Verify My Email', '/auth/callback')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">If you didn't create this account, you can safely ignore this email.</p>
        `),
      }

    case 'signup_reminder_2':
      return {
        subject: `Your JobLinks account is still waiting for you`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You're Almost There</h2>
          <p style="color: #374151; line-height: 1.6;">
            A few days ago you signed up for JobLinks, but your account still isn't verified.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Right now, employers across Antigua &amp; Barbuda are posting new jobs daily. Verify your email so you don't miss out on opportunities.
          </p>
          <div style="background-color: #f0fafa; border-left: 4px solid #0d7377; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0;">
            <p style="color: #374151; margin: 0; font-weight: 600;">What you get with JobLinks:</p>
            <ul style="color: #374151; margin: 8px 0 0; padding-left: 18px; line-height: 1.8;">
              <li>Browse and apply to local jobs</li>
              <li>Build a free professional resume</li>
              <li>Get notified when new jobs match your skills</li>
            </ul>
          </div>
          ${btn('Verify My Email', '/auth/callback')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">If you didn't create this account, you can safely ignore this email.</p>
        `),
      }

    case 'signup_reminder_3':
      return {
        subject: `Last chance — verify your JobLinks account before it expires`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Final Reminder</h2>
          <p style="color: #374151; line-height: 1.6;">
            This is our last reminder — your JobLinks account is still unverified.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            We don't want you to miss out. Employers are hiring right now and your profile could be the one they're looking for.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Click below to verify and get started — it takes less than 10 seconds.
          </p>
          ${btn('Verify My Email Now', '/auth/callback')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">If you're no longer interested, no action is needed. We won't email you again.</p>
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
