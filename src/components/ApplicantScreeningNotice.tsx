import { SCREENING_NOTICE_VERSION, SCREENING_TERMS_HREF } from '@/lib/employer-screening/notice'

/** Compact linked disclosure. Does not attest that the applicant opened or read the terms. */
export default function ApplicantScreeningNotice({ visible = false }: { visible?: boolean }) {
  if (!visible) return null
  return <span data-screening-notice-version={SCREENING_NOTICE_VERSION}>
    {' '}By submitting, you agree to our{' '}
    <a href={SCREENING_TERMS_HREF} target="_blank" rel="noopener noreferrer"
      className="text-primary underline hover:text-primary-dark">
      Terms of Service, including résumé review<span className="sr-only"> (opens in a new tab)</span>
    </a>.
  </span>
}
