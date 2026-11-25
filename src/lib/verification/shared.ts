/**
 * JobLink Verified: a free right-to-work check.
 *
 * A job seeker uploads one right-to-work document; a JobLink reviewer checks it
 * is genuine, current and theirs. The badge says only that: who can work in
 * Antigua without a permit, or who holds a work permit. It is never "safe",
 * "trusted" or a background check, and no police record is involved.
 */

export const VERIFICATION_FILE_LIMIT = 3 * 1024 * 1024
export const VERIFICATION_FILES_PER_DOCUMENT = 3
export const VERIFICATION_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'
/** A badge lasts until the document checked expires, and never more than this. */
export const VERIFICATION_MAX_MONTHS = 24

/** Bump when the consent wording changes; stored on each verification. */
export const CONSENT_VERSION = '2026-11-v2'
export const CONSENT_POINTS = [
  'JobLink will check that my document is genuine, current and belongs to me, to confirm I can work in Antigua and Barbuda.',
  'My ID, passport or permit image is deleted as soon as JobLink has decided. Only the type of document, its expiry date and my right-to-work group are kept.',
  'Only the JobLink reviewer sees the image. Employers see a confirmation written by JobLink, and only when I choose to send it with an application. It never shows ID numbers or photos.',
  'I can stop sharing or remove my badge at any time.',
] as const

export type VerificationStatus = 'draft' | 'submitted' | 'reupload_needed' | 'approved' | 'not_approved' | 'expired' | 'withdrawn'

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

/** Reasons a reviewer can ask for the document again. */
export const REUPLOAD_REASONS = {
  photo_unreadable: 'The photo is too blurry or dark to read.',
  document_cut_off: 'Part of the document is cut off. All four corners need to be in the picture.',
  wrong_document: 'This isn’t the document we need for the group you chose.',
  pages_missing: 'A page or one of the documents is missing.',
} as const
export type ReuploadReason = keyof typeof REUPLOAD_REASONS

/** Reasons a check is not approved. */
export const NOT_APPROVED_REASONS = {
  name_mismatch: 'The name on your document doesn’t match the name on your JobLink profile.',
  document_not_accepted: 'This document isn’t one we can accept.',
  document_expired: 'The document has expired.',
  document_not_genuine: 'We couldn’t confirm that the document is genuine.',
  not_eligible: 'The document doesn’t show that you can work in Antigua and Barbuda.',
} as const
export type NotApprovedReason = keyof typeof NOT_APPROVED_REASONS

export const decisionReasonText = (code: string | null | undefined): string =>
  (code && ({ ...REUPLOAD_REASONS, ...NOT_APPROVED_REASONS } as Record<string, string>)[code]) || ''

/** The review checklist, in the order the reviewer works through it. */
export const REVIEW_CHECKLIST = [
  { id: 'name', label: 'The name on the document matches the name on the JobLink profile.' },
  { id: 'accepted', label: 'The document is on the accepted list for the group chosen, and not expired.' },
  { id: 'genuine', label: 'The document looks genuine, with no signs of editing.' },
] as const

const TIME_ZONE = 'America/Antigua'

/** Today's date in Antigua as YYYY-MM-DD. */
export function antiguaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)

/** Calendar months added to a date, clamped to the end of a shorter month. */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

/**
 * The badge lasts until the document checked expires, so nobody is asked to
 * upload again needlessly, but never more than two years after the check.
 * A document with no expiry date (a national ID card, a marriage certificate)
 * lasts the two years.
 */
export function verifiedUntil(checkedOn: string, documentExpiresOn: string | null): string {
  const cap = addMonths(checkedOn, VERIFICATION_MAX_MONTHS)
  return documentExpiresOn && documentExpiresOn < cap ? documentExpiresOn : cap
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
  /** ISO date the document was checked. */
  checkedOn: string
}

export const BADGE_ELIGIBLE = 'Verified eligible to work in Antigua'
export const BADGE_PERMIT = 'Verified: holds an Antigua work permit'

/**
 * The badge wording. A permit holder never gets "eligible to work", because a
 * permit is tied to one employer and position.
 */
export const badgeText = (badge: Pick<BadgeInfo, 'holdsWorkPermit'>): string =>
  badge.holdsWorkPermit ? BADGE_PERMIT : BADGE_ELIGIBLE

export const WORK_PERMIT_NOTE = 'Holds an Antigua work permit. A new employer would need to apply for a permit.'

/** Right-to-work status line for the confirmation and public check page. */
export const rtwStatusText = (group: RtwGroup): string =>
  group === 'work_permit' ? WORK_PERMIT_NOTE : 'Eligible to work in Antigua and Barbuda without a work permit.'

export const CONFIRMATION_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/
/** Codes are shown as ABCDE-FGH23 and accepted with or without the dash, in any case. */
export const formatConfirmationCode = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`
export function parseConfirmationCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const code = input.replace(/[\s-]/g, '').toUpperCase()
  return CONFIRMATION_CODE_PATTERN.test(code) ? code : null
}
