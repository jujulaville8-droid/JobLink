import { buildEmailHtml } from '@/lib/email-templates'
import { verifiedPreviewEnabled } from '@/lib/verification/preview'
import { NOT_APPROVED_REASONS, REUPLOAD_REASONS, addMonths, antiguaToday, longDate } from '@/lib/verification/shared'

/** One email, rendered with made-up data. Preview only. */
export async function GET(_request: Request, { params }: { params: Promise<{ type: string }> }) {
  if (!verifiedPreviewEnabled()) return new Response('Not found', { status: 404 })
  const { type } = await params
  if (!/^(verification_[a-z_]+|new_applicant)$/.test(type)) return new Response('Not found', { status: 404 })
  const until = longDate(addMonths(antiguaToday(), 6))
  const { subject, html } = buildEmailHtml(type, {
    applicant_name: type === 'new_applicant' ? 'Sam Seeker' : 'Sam',
    verification_until: until,
    verification_notice: false,
    verification_reasons: type === 'verification_reupload' ? [`Police record: ${REUPLOAD_REASONS.photo_unreadable}`] : [NOT_APPROVED_REASONS.name_mismatch],
    job_title: 'Security Officer', company_name: 'Acme Security Ltd', applicant_email: 'sam@example.com', applicant_phone: '268 555 0100',
    cover_letter_excerpt: 'I have three years of experience in hotel security.', cv_attached: true,
    verified_line: `This applicant is JobLink Verified: police record and right to work checked ${longDate(antiguaToday())}.`,
    verified_documents_path: '/my-listings/0b0f6a0e-1111-4222-8333-444455556666/applicants',
    review_path: '/my-listings/0b0f6a0e-1111-4222-8333-444455556666/applicants',
  })
  const banner = `<div style="font-family:sans-serif;background:#111;color:#fff;padding:10px 16px;font-size:13px">Preview &middot; Subject: <strong>${subject.replace(/</g, '&lt;')}</strong></div>`
  return new Response(html.replace('<body', `<body data-preview`).replace(/(<body[^>]*>)/, `$1${banner}`), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
