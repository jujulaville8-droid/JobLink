import { resumeReviewV2EmailSection } from './employer-screening/review-v2-email'
import type { ResumeReviewV2 } from './employer-screening/review-v2'
import type { Report } from './employer-screening'
import { employerAdvisoryEmailSection } from './employer-screening/email'
import type { ResumeDocumentQualityResult } from './employer-screening/quality'

type EmailType =
  | 'listing_submitted'
  | 'listing_submitted_admin'
  | 'application_confirmation'
  | 'new_applicant'
  | 'status_update'
  | 'job_alert'
  | 'job_closed_applicant'
  | 'job_closed_employer'
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
  | 'verification_upload_ready'
  | 'verification_paid_waiting'
  | 'verification_approved'
  | 'verification_reupload'
  | 'verification_not_approved'
  | 'verification_expiring'
  | 'verification_expired'
  | 'verification_upload_reminder'

interface EmailData {
  /** Reserved for validated worker output; absent in the unchanged live forwarding path. */
  employer_resume_review_v2?: ResumeReviewV2
  employer_screening?: Report
  employer_resume_quality?: ResumeDocumentQualityResult
  applicant_count?: number
  applicant_name?: string
  applicant_email?: string
  applicant_phone?: string
  cover_letter_excerpt?: string
  cv_attached?: boolean
  review_path?: string
  job_title?: string
  company_name?: string
  status?: string
  jobs?: { title: string; company: string; url: string }[]
  suggested_jobs?: { title: string; company: string; location: string; url: string }[]
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
  /** JobLink Verified. Dates arrive already formatted; reasons come from a fixed list. */
  verification_until?: string
  verification_reasons?: string[]
  verification_notice?: boolean
  verified_line?: string | null
  verified_documents_path?: string | null
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
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">JobLink</h1>
        </div>
        <div style="padding: 32px 24px;">
          ${content}
        </div>
        <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">JobLink${emailType === 'listing_submitted' || emailType === 'listing_submitted_admin' || emailType === 'new_applicant' || emailType === 'job_closed_applicant' || emailType === 'job_closed_employer' ? '<br>' : ' &mdash; '}Antigua &amp; Barbuda's Job Platform</p>
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
    case 'listing_submitted':
      return {
        subject: `Job received: ${d.job_title || 'Your listing'}`,
        html: wrapper(`<h2>We received your job</h2><p>${esc(d.job_title)} at ${esc(d.company_name)} is pending review.</p><p>Usually reviewed within one business day. You will get an email when it goes live.</p>${btn('View my listings', '/my-listings')}`),
      }
    case 'listing_submitted_admin':
      return {
        subject: `Listing ready for review: ${d.job_title || 'New job'}`,
        html: wrapper(`<h2>A job is ready for review</h2><p>${esc(d.company_name)} submitted ${esc(d.job_title)}.</p><p>Status: pending review.</p>${btn('Review listings', '/admin/approvals')}`),
      }
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
            <strong>${esc(d.applicant_name)}</strong> has applied for <strong>${esc(d.job_title)}</strong>${d.company_name ? ` at <strong>${esc(d.company_name)}</strong>` : ''}.
          </p>
          ${d.applicant_email ? `<p>Email: ${esc(d.applicant_email)}</p>` : ''}
          ${d.applicant_phone ? `<p>Phone: ${esc(d.applicant_phone)}</p>` : ''}
          ${d.cover_letter_excerpt ? `<h3>Cover letter excerpt</h3><p style="white-space:pre-wrap;line-height:1.6;">${esc(d.cover_letter_excerpt)}</p>` : ''}
          <p>${d.cv_attached ? 'The applicant’s CV is attached to this email.' : 'A CV attachment is unavailable. You can contact the applicant using the details above.'}</p>
          ${d.verified_line ? `<p style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 12px; color: #065f46; line-height: 1.6;"><strong>${esc(d.verified_line)}</strong><br>${d.verified_documents_path && /^\/my-listings\/[0-9a-f-]{36}\/applicants$/.test(d.verified_documents_path) ? `<a href="${SITE}${d.verified_documents_path}" style="color: #0d7377; font-weight: 600;">View documents</a> (you'll be asked to log in). ` : ''}For privacy, the police record is never sent by email.</p>` : ''}
          ${d.employer_resume_review_v2 ? resumeReviewV2EmailSection(d.employer_resume_review_v2) : d.employer_screening || d.employer_resume_quality ? employerAdvisoryEmailSection(d.employer_screening, d.employer_resume_quality) : ''}
          ${d.review_path && /^\/my-listings\/[0-9a-f-]{36}\/applicants$/.test(d.review_path) ? btn('Review Applicant', d.review_path) : ''}
          ${!d.employer_resume_review_v2 && !d.employer_screening && !d.employer_resume_quality ? '<p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">Tip: Responding quickly helps you secure the best candidates before other employers do.</p>' : ''}
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
          ${isRejected ? `<p style="color: #374151; line-height: 1.6;">This one didn't work out, but don't let it stop you. There are more opportunities waiting on JobLink.</p>` : ''}
          ${isHold ? `<p style="color: #374151; line-height: 1.6;">Your application is on hold. The employer may follow up with next steps.</p>` : ''}
          ${!isInterview && !isRejected && !isHold ? `<p style="color: #374151; line-height: 1.6;">The employer is moving forward with your application. Stay tuned for further updates.</p>` : ''}
          ${isRejected ? btn('Browse More Jobs', '/jobs') : btn('View My Applications', '/applications')}
        `),
      }
    }

    case 'job_closed_applicant': {
      // Keep this update free of em dashes, including employer-provided labels.
      const copy = (value: string | undefined) => (value || '').replace(/\s*\u2014\s*/g, ', ')
      const suggestions = (d.suggested_jobs || []).slice(0, 4)
      return {
        subject: `Update on your application for ${copy(d.job_title)} at ${copy(d.company_name)}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">An Update on Your Application</h2>
          <p style="color: #374151; line-height: 1.6;">Hi ${esc(copy(d.applicant_name)) || 'there'},</p>
          <p style="color: #374151; line-height: 1.6;">
            The <strong>${esc(copy(d.job_title))}</strong> role at <strong>${esc(copy(d.company_name))}</strong>
            is no longer available, and the listing has been closed on JobLink.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            ${esc(copy(d.company_name))} has contacted the candidates it is moving forward with in the hiring process.
            If you have not heard from the company, you were not selected for interview this time.
          </p>
          <p style="color: #374151; line-height: 1.6;">Keep going. New roles are added every week, and your next opportunity could be just ahead.</p>
          ${suggestions.length ? `
            <h3 style="color: #0d7377;">Open roles you may want to apply to next</h3>
            ${suggestions.map(job => `
              <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                <h4 style="margin: 0 0 4px;"><a href="${esc(job.url)}" style="color: #0d7377;">${esc(copy(job.title))}</a></h4>
                <p style="color: #6b7280; margin: 0;">${esc(copy(job.company))} · ${esc(copy(job.location))}</p>
              </div>
            `).join('')}
          ` : ''}
          <p style="color: #374151; line-height: 1.6;">You can also <a href="${SITE}/jobs" style="color: #0d7377;">browse all current jobs on JobLink</a>.</p>
        `),
      }
    }

    case 'job_closed_employer': {
      // Keep this update free of em dashes, including employer-provided labels.
      const copy = (value: string | undefined) => (value || '').replace(/\s*\u2014\s*/g, ', ')
      const applicantCount = d.applicant_count ?? 0
      return {
        subject: `Your listing for ${copy(d.job_title)} has been closed`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Your Listing Has Been Closed</h2>
          <p style="color: #374151; line-height: 1.6;">
            The <strong>${esc(copy(d.job_title))}</strong> role at <strong>${esc(copy(d.company_name))}</strong>
            has been closed on JobLink.
          </p>
          ${applicantCount > 0 ? `
          <p style="color: #374151; line-height: 1.6;">
            All ${applicantCount} applicants were notified by email that the position is no longer available
            and that ${esc(copy(d.company_name))} has contacted the candidates it is moving forward with.
            Similar open roles were suggested to them.
          </p>` : `
          <p style="color: #374151; line-height: 1.6;">
            This listing had no applicants, so there was no one to notify this time.
          </p>`}
          <p style="color: #374151; line-height: 1.6;">Nothing further is needed from you.</p>
          <p style="color: #374151; line-height: 1.6;">Thank you for using JobLink to hire. We appreciate you posting your role with us.</p>
          <p style="color: #374151; line-height: 1.6;">Ready to grow your team again? Post another role on JobLink.</p>
          ${btn('Post Another Role', '/post-job')}
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
          <p style="color: #6b7280; font-size: 13px; margin-top: 16px;">You received this because you saved a matching job alert. <a href="${SITE}/alerts" style="color: #0d7377;">Manage or delete your alerts</a> to change which emails you receive.</p>
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
            We appreciate you helping keep JobLink safe and trustworthy for everyone.
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
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px 0;">Keep your JobLink profile up to date</p>
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
            You signed up for JobLink — great first step! But we noticed you haven't added a resume to your profile yet.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Employers across Antigua &amp; Barbuda are actively searching for candidates right now.
            Profiles with a resume are <strong>3x more likely</strong> to get contacted by employers.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            You can upload a resume you already have, or build one right on JobLink in just a few minutes.
          </p>
          <div style="margin: 24px 0; text-align: center;">
            ${btn('Upload My Resume', '/profile')}
          </div>
          <p style="text-align: center; margin-top: 12px;">
          </p>
        `),
      }

    case 'resume_nudge_2':
      return {
        subject: `${esc(d.applicant_name) || 'Hey'}, don't miss out — employers are hiring now`,
        html: wrapper(`
          <h2 style="color: #1f2937; margin: 0 0 8px;">Quick reminder, ${esc(d.applicant_name) || 'there'}!</h2>
          <p style="color: #374151; line-height: 1.6;">
            We noticed you still haven't added a resume to your JobLink profile. That's okay — it only takes a couple of minutes.
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
            <li><strong>Build one</strong> on JobLink in under 3 minutes</li>
          </ul>
          <div style="margin: 24px 0; text-align: center;">
            ${btn('Add My Resume Now', '/profile')}
          </div>
          <p style="text-align: center; margin-top: 12px;">
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
            Here's something most people don't realise: <strong>employers on JobLink are browsing profiles every single day</strong> — even when they haven't posted a job yet. They're searching for the right person before they ever publish a listing.
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
            Upload your resume to your profile:
          </p>

          <div style="display: flex; gap: 12px; margin: 24px 0;">
            <div style="flex: 1; background-color: #f0fafa; border-radius: 12px; padding: 20px; text-align: center;">
              <p style="color: #0d7377; font-weight: 700; margin: 0 0 6px 0; font-size: 15px;">Upload Your Resume</p>
              <p style="color: #6b7280; font-size: 13px; margin: 0 0 12px 0;">Already have a CV? Upload it in seconds.</p>
              <a href="${SITE}/profile" style="display: inline-block; background-color: #0d7377; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Upload Now</a>
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
        subject: `Don't forget to verify your JobLink account`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">One Step Left!</h2>
          <p style="color: #374151; line-height: 1.6;">
            You recently signed up for JobLink — Antigua &amp; Barbuda's job platform — but you haven't verified your email yet.
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
        subject: `Your JobLink account is still waiting for you`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You're Almost There</h2>
          <p style="color: #374151; line-height: 1.6;">
            A few days ago you signed up for JobLink, but your account still isn't verified.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            Right now, employers across Antigua &amp; Barbuda are posting new jobs daily. Verify your email so you don't miss out on opportunities.
          </p>
          <div style="background-color: #f0fafa; border-left: 4px solid #0d7377; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0;">
            <p style="color: #374151; margin: 0; font-weight: 600;">What you get with JobLink:</p>
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
        subject: `Last chance — verify your JobLink account before it expires`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Final Reminder</h2>
          <p style="color: #374151; line-height: 1.6;">
            This is our last reminder — your JobLink account is still unverified.
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

    // JobLink Verified. No email ever carries a document: each one links to
    // a page that needs login. "Applying is always free" stays in every one.
    case 'verification_upload_ready':
      return {
        subject: 'Upload your documents to get verified',
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Your upload is ready</h2>
          <p style="color: #374151; line-height: 1.6;">We've received your EC$40 verification fee. Next, upload two things:</p>
          <ul style="color: #374151; line-height: 1.8; padding-left: 18px;">
            <li>A right-to-work document, such as your passport or national ID</li>
            <li>A police record issued in the last 30 days</li>
          </ul>
          <p style="color: #374151; line-height: 1.6;">We review within 48 hours. If we can't verify you, we refund you in full.</p>
          ${btn('Upload my documents', '/verification')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">Your ID is deleted once checked and never shared. Your police record is stored privately, and only employers you choose can see it.</p>
        `),
      }
    case 'verification_paid_waiting':
      return {
        subject: 'Payment received: we\'ll email you when your upload is ready',
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Payment received</h2>
          <p style="color: #374151; line-height: 1.6;">Thank you. We've received your EC$40 verification fee.</p>
          <p style="color: #374151; line-height: 1.6;">We'll email you within 24 hours when your upload is ready. You don't need to do anything until then.</p>
          <p style="color: #374151; line-height: 1.6;">While you wait, get your police record from the Criminal Records Office if you don't have one from the last 30 days.</p>
          ${btn('How to get your police record', '/guides/police-record')}
        `),
      }
    case 'verification_approved':
      return {
        subject: `You're verified until ${d.verification_until || 'your badge end date'}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">You're JobLink Verified</h2>
          <p style="color: #374151; line-height: 1.6;">Hi ${esc(d.applicant_name) || 'there'}, your documents have been checked. Your badge is valid until <strong>${esc(d.verification_until)}</strong>.</p>
          ${d.verification_notice ? `<p style="color: #374151; line-height: 1.6; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px;">Before you share your police record, there is a short note from our reviewer for you to read. You'll see it on your verification page.</p>` : ''}
          <p style="color: #374151; line-height: 1.6;"><strong>How sharing works</strong></p>
          <ul style="color: #374151; line-height: 1.8; padding-left: 18px;">
            <li>When you apply, tick "Send my verified documents". Nothing is sent unless you tick it.</li>
            <li>You can preview exactly what an employer will see first.</li>
            <li>You can see which employers opened your documents, and stop sharing at any time.</li>
          </ul>
          ${btn('See my verification', '/verification')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">Your ID image has been deleted. Applying on JobLink is always free.</p>
        `),
      }
    case 'verification_reupload':
      return {
        subject: 'One more upload needed to finish your verification',
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">We need a document again</h2>
          <p style="color: #374151; line-height: 1.6;">Hi ${esc(d.applicant_name) || 'there'}, we couldn't finish checking your documents yet:</p>
          <ul style="color: #374151; line-height: 1.8; padding-left: 18px;">${(d.verification_reasons || []).map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>
          <p style="color: #374151; line-height: 1.6;">Uploading again is free. There is no new fee.</p>
          ${btn('Upload again', '/verification')}
        `),
      }
    case 'verification_not_approved':
      return {
        subject: 'Your verification could not be completed: full refund sent',
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">We couldn't verify your documents</h2>
          <p style="color: #374151; line-height: 1.6;">Hi ${esc(d.applicant_name) || 'there'}, we weren't able to complete your verification:</p>
          <ul style="color: #374151; line-height: 1.8; padding-left: 18px;">${(d.verification_reasons || []).map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>
          <p style="color: #374151; line-height: 1.6;">We've refunded your <strong>EC$40</strong> verification fee in full to the card you paid with. It usually arrives within 5 to 10 business days.</p>
          <p style="color: #374151; line-height: 1.6;">The files you uploaded have been deleted. Employers are not told anything about this, and you can keep applying for jobs for free as usual.</p>
          ${btn('Browse jobs', '/jobs')}
        `),
      }
    case 'verification_expiring':
      return {
        subject: `Your verified badge ends on ${d.verification_until || 'soon'}`,
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Renew to keep your badge</h2>
          <p style="color: #374151; line-height: 1.6;">Hi ${esc(d.applicant_name) || 'there'}, your JobLink Verified badge ends on <strong>${esc(d.verification_until)}</strong>. After that, the badge and your stored police record are removed.</p>
          <p style="color: #374151; line-height: 1.6;">Renewing is a new EC$40 check with a new police record issued in the last 30 days. It is optional, and applying stays free either way.</p>
          ${btn('Renew my verification', '/verification')}
        `),
      }
    case 'verification_expired':
      return {
        subject: 'Your verified badge and stored police record have been removed',
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Your badge has ended</h2>
          <p style="color: #374151; line-height: 1.6;">Hi ${esc(d.applicant_name) || 'there'}, your JobLink Verified badge has reached its end date. We've removed the badge and deleted your stored police record, as promised.</p>
          <p style="color: #374151; line-height: 1.6;">You can renew any time with a new police record. Applying on JobLink is always free.</p>
          ${btn('Renew, EC$40', '/verification')}
        `),
      }
    case 'verification_upload_reminder':
      return {
        subject: 'Your verification is waiting for your documents',
        html: wrapper(`
          <h2 style="color: #0d7377; margin-top: 0;">Upload your documents</h2>
          <p style="color: #374151; line-height: 1.6;">Hi ${esc(d.applicant_name) || 'there'}, you paid the EC$40 verification fee but we haven't received your documents yet.</p>
          <p style="color: #374151; line-height: 1.6;">If we don't receive them within 60 days of your payment, we'll refund you in full automatically.</p>
          ${btn('Upload my documents', '/verification')}
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;"><a href="${SITE}/guides/police-record" style="color: #0d7377;">How to get your police record in Antigua</a></p>
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
