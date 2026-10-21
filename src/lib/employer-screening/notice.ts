/** Draft disclosure copy. Publishing/enabling requires privacy and legal review. */
export const SCREENING_NOTICE_VERSION = 'resume-advisory-notice-v1' as const
export const SCREENING_NOTICE_TEXT = 'Your résumé may be processed with AI using OpenAI to compare minimized job-related evidence and professional context with the employer’s criteria. A separate text-based assessment may describe the résumé’s organization and evidence presentation. These advisory reports are shared only with the employer receiving your application, alongside your original résumé. Missing or uncertain evidence is not a failed requirement. The employer makes all hiring decisions; this processing does not automatically reject or hide your application.'
/** Versioned disclosure attestation, not a claim of consent or legal sufficiency. */
export function hasCurrentScreeningNotice(value: unknown): boolean { return value === SCREENING_NOTICE_VERSION }
