/**
 * JobLink Verified: constants and pure helpers shared by server and browser.
 *
 * Wording here follows the launch plan's rules: "verification fee" (never
 * processing or application fee), prices as EC$, and the badge only ever
 * claims that documents were checked on a date.
 */

export const VERIFICATION_AMOUNT_CENTS = 4000
export const VERIFICATION_CURRENCY = 'xcd'
export const VERIFICATION_PRICE_LABEL = 'EC$40'
export const VERIFICATION_MONTHS = 6
export const POLICE_RECORD_MAX_AGE_DAYS = 30
export const VERIFICATION_FILE_LIMIT = 3 * 1024 * 1024
export const VERIFICATION_FILES_PER_DOCUMENT = 3
export const VERIFICATION_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'

/** Bump when the consent wording changes; stored on each verification. */
export const CONSENT_VERSION = '2026-11-v1'
export const CONSENT_POINTS = [
  'JobLink will check that my police record is genuine, issued in the last 30 days and belongs to me. JobLink does not judge what it says.',
  'My ID, passport or permit image is deleted as soon as JobLink has decided. Only the type of document, its expiry date and my right-to-work group are kept.',
  'My police record is stored encrypted until my badge ends, then deleted automatically. It is stored with JobLink’s storage provider in the United States.',
  'Only the JobLink reviewer can see my uploads. An employer sees my police record only when I choose to send it with an application.',
  'I can stop sharing, delete my documents or delete my account at any time.',
] as const

export type VerificationStatus =
  | 'awaiting_payment' | 'paid' | 'submitted' | 'reupload_needed'
  | 'approved' | 'not_approved' | 'expired' | 'withdrawn'

export type VerificationDocument = 'rtw' | 'police_record'

export const RTW_GROUPS = {
  citizen: {
    label: 'Antiguan and Barbudan citizen',
    hint: 'Including citizenship by investment or registration',
    proof: 'Antigua and Barbuda passport or national ID card',
    documentTypes: ['passport', 'national_id'],
  },
  permanent_resident: {
    label: 'Permanent resident',
    hint: '',
    proof: 'Residency document and passport',
    documentTypes: ['residency_document'],
  },
  oecs_citizen: {
    label: 'OECS citizen',
    hint: 'Dominica, Grenada, Montserrat, St Kitts and Nevis, Saint Lucia, St Vincent and the Grenadines',
    proof: 'Passport from your OECS country',
    documentTypes: ['passport'],
  },
  oecs_spouse: {
    label: 'Spouse of an OECS citizen',
    hint: '',
    proof: 'Marriage certificate, your passport and your spouse’s OECS passport',
    documentTypes: ['marriage_certificate'],
  },
  caricom_skills: {
    label: 'CARICOM national with a Skills Certificate',
    hint: '',
    proof: 'Certificate of Recognition of CARICOM Skills Qualification and passport',
    documentTypes: ['skills_certificate'],
  },
  work_permit: {
    label: 'Work permit holder',
    hint: 'A work permit is tied to one employer and position',
    proof: 'Antigua work permit and passport',
    documentTypes: ['work_permit'],
  },
} as const satisfies Record<string, { label: string; hint: string; proof: string; documentTypes: readonly string[] }>

export type RtwGroup = keyof typeof RTW_GROUPS
export const RTW_GROUP_KEYS = Object.keys(RTW_GROUPS) as RtwGroup[]
export const isRtwGroup = (value: unknown): value is RtwGroup =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(RTW_GROUPS, value)

export const RTW_DOCUMENT_TYPES = {
  passport: 'Passport',
  national_id: 'National ID card',
  residency_document: 'Residency document',
  marriage_certificate: 'Marriage certificate and passports',
  skills_certificate: 'CARICOM Skills Certificate',
  work_permit: 'Antigua work permit',
} as const
export type RtwDocumentType = keyof typeof RTW_DOCUMENT_TYPES
export const isRtwDocumentType = (value: unknown): value is RtwDocumentType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(RTW_DOCUMENT_TYPES, value)

/** Reasons a reviewer can ask for a document again. The upload is free. */
export const REUPLOAD_REASONS = {
  photo_unreadable: 'The photo is too blurry or dark to read.',
  document_cut_off: 'Part of the document is cut off. All four corners need to be in the picture.',
  wrong_document: 'This isn’t the document we need for the group you chose.',
  pages_missing: 'A page or one of the documents is missing.',
} as const
export type ReuploadReason = keyof typeof REUPLOAD_REASONS

/**
 * Reasons a check is not approved, each with a full refund. None of them is
 * about what a police record says: that never decides the outcome.
 */
export const NOT_APPROVED_REASONS = {
  name_mismatch: 'The name on your documents doesn’t match the name on your JobLink profile.',
  document_not_accepted: 'The right-to-work document isn’t one we can accept.',
  document_expired: 'The right-to-work document has expired.',
  police_record_too_old: 'The police record was issued more than 30 days ago.',
  document_not_genuine: 'We couldn’t confirm that a document is genuine.',
  not_eligible: 'The documents don’t show that you can work in Antigua and Barbuda.',
  no_upload_received: 'We didn’t receive your documents within 60 days of payment.',
} as const
export type NotApprovedReason = keyof typeof NOT_APPROVED_REASONS

export const decisionReasonText = (code: string | null | undefined): string =>
  (code && ({ ...REUPLOAD_REASONS, ...NOT_APPROVED_REASONS } as Record<string, string>)[code]) || ''

export const DOCUMENT_LABELS: Record<VerificationDocument, string> = {
  rtw: 'Right-to-work document',
  police_record: 'Police record',
}

/** The review checklist, in the order the reviewer works through it. */
export const REVIEW_CHECKLIST = [
  { id: 'name', label: 'The name matches across the right-to-work document, the police record and the profile.' },
  { id: 'accepted', label: 'The document is on the accepted list and not expired.' },
  { id: 'police', label: 'The police record is genuine, under 30 days old and belongs to this person. What it says never decides the outcome.' },
  { id: 'spent', label: 'If it shows a conviction marked as spent, the notice flag below is set so the job seeker is told before anything is shared.' },
  { id: 'editing', label: 'No signs of editing.' },
] as const

const TIME_ZONE = 'America/Antigua'

/** Today's date in Antigua as YYYY-MM-DD. */
export function antiguaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
export { isIsoDate }

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)

/** A police record counts if it is dated today or within the last 30 days. */
export function policeRecordIsRecent(issuedOn: string, today: string = antiguaToday()): boolean {
  const age = daysBetween(issuedOn, today)
  return age >= 0 && age <= POLICE_RECORD_MAX_AGE_DAYS
}

/** Calendar months added to a date, clamped to the end of a shorter month. */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

/**
 * The badge lasts 6 months from the date on the police record. Any
 * right-to-work document that expires sooner (a work permit, most often)
 * ends it sooner.
 */
export function verifiedUntil(policeRecordIssuedOn: string, documentExpiresOn: string | null): string {
  const sixMonths = addMonths(policeRecordIssuedOn, VERIFICATION_MONTHS)
  return documentExpiresOn && documentExpiresOn < sixMonths ? documentExpiresOn : sixMonths
}

export const badgeIsValid = (
  verification: { status: string; verified_until: string | null } | null | undefined,
  today: string = antiguaToday(),
): boolean => !!verification && verification.status === 'approved' && !!verification.verified_until && verification.verified_until >= today

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Nov 2026" from an ISO date or timestamp. */
export function monthYear(iso: string): string {
  const date = iso.length === 10 ? iso : antiguaToday(new Date(iso))
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
}

/** "14 November 2026" from an ISO date or timestamp. */
export function longDate(iso: string): string {
  const date = iso.length === 10 ? iso : antiguaToday(new Date(iso))
  return `${Number(date.slice(8, 10))} ${LONG_MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
}

export interface BadgeInfo {
  holdsWorkPermit: boolean
  /** ISO date the documents were checked. */
  checkedOn: string
}

/** The exact badge wording from the plan. Never "safe", "trusted" or "background checked". */
export function badgeText(badge: BadgeInfo): string {
  return badge.holdsWorkPermit
    ? `Holds an Antigua work permit · police record checked · ${monthYear(badge.checkedOn)}`
    : `Can work in Antigua without a permit · ID and police record checked · ${monthYear(badge.checkedOn)}`
}

export const WORK_PERMIT_NOTE = 'Holds an Antigua work permit. A new employer would need to apply for a permit.'

/** Right-to-work status line for the confirmation and public check page. */
export const rtwStatusText = (group: RtwGroup): string =>
  group === 'work_permit' ? WORK_PERMIT_NOTE : 'Can work in Antigua and Barbuda without a work permit.'

export const CONFIRMATION_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/
/** Codes are shown as ABCDE-FGH23 and accepted with or without the dash, in any case. */
export const formatConfirmationCode = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`
export function parseConfirmationCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const code = input.replace(/[\s-]/g, '').toUpperCase()
  return CONFIRMATION_CODE_PATTERN.test(code) ? code : null
}
