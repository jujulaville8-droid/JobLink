/** Employer-facing outcomes contain no resume data or internal failure details. */
export const NOT_SCREENED_TEXT = {
  no_resume: 'Not screened: this applicant did not provide a resume to screen.',
  resume_unreadable: "Not screened: the applicant's resume could not be read.",
  screening_unavailable: 'Not screened: screening could not be completed for this application.',
} as const
export type NotScreenedReason = keyof typeof NOT_SCREENED_TEXT

// First production verdict, November 14, 2026 (UTC).
export const SCREENING_LAUNCH_AT = '2026-11-14T21:51:00Z'
export function applicationScreeningLine(application: { applied_at: string; employer_forward_status?: string | null }, recorded?: string): string {
  if (recorded) return recorded
  if (Date.parse(application.applied_at) < Date.parse(SCREENING_LAUNCH_AT)) {
    return 'Not screened: this application arrived before screening was turned on.'
  }
  if (application.employer_forward_status === 'not_sent') {
    return 'Not screened: this application was not forwarded to the employer.'
  }
  return NOT_SCREENED_TEXT.screening_unavailable
}
