/** Draft disclosure copy. Publishing/enabling requires privacy and legal review. */
export const SCREENING_NOTICE_VERSION = 'resume-advisory-terms-link-v2' as const
// Already-open forms may still attest to the previously displayed full notice.
const LEGACY_FULL_SCREENING_NOTICE_VERSION = 'resume-advisory-notice-v1' as const
export const SCREENING_TERMS_HREF = '/terms#resume-review' as const
export const SCREENING_NOTICE_TEXT = 'Your résumé may be processed with AI using OpenAI to compare minimized job-related evidence and professional context with the employer’s criteria. A separate text-based assessment may describe the résumé’s organization and evidence presentation. These advisory reports and scores are shared only with the employer receiving your application, alongside your original résumé. Missing or uncertain evidence is not a failed requirement. The employer makes all hiring decisions; this processing does not automatically reject or hide your application.'
/** Attests to the rendered linked terms disclosure, not opened/read terms,
 * explicit consent, or legal sufficiency. Accept only these two known disclosure variants. */
export function hasCurrentScreeningNotice(value: unknown): boolean {
  return value === SCREENING_NOTICE_VERSION || value === LEGACY_FULL_SCREENING_NOTICE_VERSION
}
