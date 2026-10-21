import { resumeFilename } from '@/lib/resume-filename'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { parseCompanyContactEmail } from '@/lib/company-contact-email'
import { inlineEmployerScreening, inlineScreeningDependencies, inlineScreeningEnabled, type InlineScreeningFields } from '@/lib/employer-screening/inline'

const MAX_CV_BYTES = 5 * 1024 * 1024

/** Normalize legacy storage URLs without accepting another host, bucket or owner. */
export function applicantCvPath(value: unknown, userId: string): string | null {
  if (typeof value !== 'string' || !value || value.length > 2000) return null
  let path = value
  if (/^https?:/i.test(path)) {
    try {
      const url = new URL(path)
      const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin
      if (url.origin !== origin || url.username || url.password) return null
      const prefix = ['/storage/v1/object/public/cvs/', '/storage/v1/object/sign/cvs/']
        .find(marker => url.pathname.startsWith(marker))
      if (!prefix) return null
      path = decodeURIComponent(url.pathname.slice(prefix.length))
    } catch { return null }
  }
  // Uploaded CVs belong to the seeker's auth-user folder. No nested paths,
  // encoded separators, traversal, queries, or arbitrary URLs reach service storage.
  const parts = path.split('/')
  return parts.length === 2 && parts[0] === userId &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.pdf$/i.test(parts[1]) && !parts[1].includes('..')
    ? path : null
}

/** Called only after a verified seeker successfully inserts an application. */
export async function notifyNewApplicant(applicationId: string, applicantUserId: string, noticeVersion?: unknown): Promise<boolean> {
  // No provider key means no private-file reads or accidental delivery in local builds.
  if (!process.env.RESEND_API_KEY) return false
  const sent = await forwardApplicationToEmployer(applicationId, applicantUserId, noticeVersion)
  await recordEmployerForward(applicationId, sent)
  return sent
}

/**
 * Records whether the application reached the employer, for admins. Stores no
 * recipient or message content. Tolerates a database without the tracking
 * columns so applying never fails because of bookkeeping.
 */
async function recordEmployerForward(applicationId: string, sent: boolean): Promise<void> {
  try {
    const now = new Date().toISOString()
    const { error } = await createAdminClient().from('applications').update({
      employer_forward_status: sent ? 'sent' : 'not_sent',
      employer_forward_attempted_at: now,
      ...(sent ? { employer_forwarded_at: now } : {}),
    }).eq('id', applicationId)
    if (error) console.warn('[applicant-notification] Forward status not recorded')
  } catch {
    console.warn('[applicant-notification] Forward status not recorded')
  }
}

async function forwardApplicationToEmployer(applicationId: string, applicantUserId: string, noticeVersion?: unknown): Promise<boolean> {
  try {
    const db = createAdminClient()
    const { data: application, error: applicationError } = await db.from('applications')
      .select('id, job_id, seeker_id, cover_letter_text').eq('id', applicationId).single()
    if (applicationError || !application) return false
    const { data: seeker, error: seekerError } = await db.from('seeker_profiles')
      .select('first_name, last_name, phone, cv_url').eq('id', application.seeker_id)
      .eq('user_id', applicantUserId).single()
    if (seekerError || !seeker) return false
    const { data: job, error: jobError } = await db.from('job_listings')
      .select('id, title, company_id').eq('id', application.job_id).single()
    if (jobError || !job) return false
    const { data: company, error: companyError } = await db.from('companies')
      .select('user_id, company_name, contact_email').eq('id', job.company_id).single()
    if (companyError || !company) return false
    const { data: owner, error: ownerError } = await db.from('users')
      .select('email, email_verified, is_banned').eq('id', company.user_id).single()
    if (ownerError || owner?.is_banned === true) return false
    const contact = parseCompanyContactEmail(company.contact_email)
    const account = parseCompanyContactEmail(owner?.email)
    // An invalid saved contact is a configuration error: fail closed rather
    // than silently send private applicant details to a different recipient.
    if (!contact.valid) return false
    const recipient = contact.email || (account.valid && owner?.email_verified === true ? account.email : null)
    if (!recipient) return false
    const { data: applicant, error: applicantError } = await db.from('users')
      .select('email, is_banned').eq('id', applicantUserId).single()
    if (applicantError || !applicant || applicant.is_banned === true) return false
    const applicantEmail = parseCompanyContactEmail(applicant.email)
    const name = [seeker.first_name, seeker.last_name].filter(Boolean).join(' ').trim().slice(0, 200) || 'A candidate'
    const path = applicantCvPath(seeker.cv_url, applicantUserId)
    const attachments: { filename: string; content: Buffer; contentType: string }[] = []
    if (path) {
      try {
        const { data: file, error: downloadError } = await db.storage.from('cvs').download(path)
        if (!downloadError && file && file.size > 0 && file.size <= MAX_CV_BYTES) {
          const bytes = Buffer.from(await file.arrayBuffer())
          if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
            attachments.push({ filename: resumeFilename(seeker.first_name, seeker.last_name), content: bytes, contentType: 'application/pdf' })
          }
        }
      } catch { /* Send contact details even when storage is unavailable. */ }
    } else if (!seeker.cv_url) {
      // Apply also accepts resumes made in JobLink's builder. Render the same
      // document privately, only for the already-bound applicant user.
      try {
        const { fetchFullCv } = await import('@/lib/cv-helpers')
        const cv = await fetchFullCv(applicantUserId, true)
        if (cv?.profile.user_id === applicantUserId) {
          const { createResumeDocument } = await import('@/lib/resume-pdf')
          const { renderToBuffer } = await import('@react-pdf/renderer')
          const bytes = await renderToBuffer(createResumeDocument(cv))
          if (bytes.length > 0 && bytes.length <= MAX_CV_BYTES) {
            attachments.push({ filename: resumeFilename(cv.contact.first_name, cv.contact.last_name), content: bytes, contentType: 'application/pdf' })
          }
        }
      } catch { /* An unavailable built resume must not block the application. */ }
    }
    // Enrich only these exact in-memory attachment bytes. The original send,
    // recipient and duplicate-prevention key remain the sole delivery path.
    let screening: InlineScreeningFields = {}
    if (attachments[0] && inlineScreeningEnabled(noticeVersion)) {
      try {
        screening = await inlineEmployerScreening({ applicationId: application.id, applicantUserId,
          jobId: job.id, companyId: job.company_id, jobTitle: job.title,
          noticeVersion, resumeBytes: attachments[0].content }, inlineScreeningDependencies(db))
      } catch { /* Optional enrichment must never prevent the original email. */ }
    }
    const result = await sendEmail({
      to: recipient,
      type: 'new_applicant',
      idempotencyKey: `application/${application.id}/employer`,
      replyTo: applicantEmail.valid ? applicantEmail.email || undefined : undefined,
      attachments,
      data: {
        ...screening,
        applicant_name: name,
        applicant_email: applicantEmail.valid ? applicantEmail.email : null,
        applicant_phone: typeof seeker.phone === 'string' ? seeker.phone.trim().slice(0, 80) : null,
        job_title: job.title,
        company_name: company.company_name,
        cover_letter_excerpt: typeof application.cover_letter_text === 'string'
          ? application.cover_letter_text.trim().slice(0, 1500) : '',
        cv_attached: attachments.length > 0,
        // Only the actual owner has this dashboard. External contacts can use
        // the attached CV and Reply-To without needing a placeholder account.
        review_path: account.valid && owner?.email_verified === true && account.email === recipient
          ? `/my-listings/${job.id}/applicants` : null,
      },
    })
    return result.success
  } catch {
    console.warn('[applicant-notification] Notification unavailable')
    return false
  }
}
