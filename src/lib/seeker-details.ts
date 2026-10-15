/**
 * Optional, deeper seeker profile details.
 *
 * Practical details (SeekerDetails) are stored on seeker_profiles and may be
 * shown to employers on applications. Sensitive details (SensitiveDetails) are
 * stored in seeker_sensitive_details, which RLS limits to the seeker and
 * JobLinks admins; never render them on employer or public pages.
 */

export const AVAILABILITY_OPTIONS = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  shifts: 'Shifts',
  weekends: 'Weekends',
} as const
export type Availability = keyof typeof AVAILABILITY_OPTIONS

export const NOTICE_PERIOD_OPTIONS = {
  immediately: 'Available immediately',
  one_week: '1 week',
  two_weeks: '2 weeks',
  one_month: '1 month',
  more_than_one_month: 'More than 1 month',
} as const
export type NoticePeriod = keyof typeof NOTICE_PERIOD_OPTIONS

export const MARITAL_STATUS_OPTIONS = {
  single: 'Single',
  married: 'Married',
  common_law: 'Common-law',
  divorced: 'Divorced',
  separated: 'Separated',
  widowed: 'Widowed',
  prefer_not_to_say: 'Prefer not to say',
} as const
export type MaritalStatus = keyof typeof MARITAL_STATUS_OPTIONS

export interface SeekerDetails {
  currently_employed: boolean | null
  has_own_transport: boolean | null
  has_drivers_licence: boolean | null
  availability: Availability[]
  willing_to_relocate: boolean | null
  languages: string[]
  certifications: string[]
  notice_period: NoticePeriod | null
  earliest_start_date: string | null
}

export interface SensitiveDetails {
  marital_status: MaritalStatus | null
  children_count: number | null
}

export const EMPTY_SEEKER_DETAILS: SeekerDetails = {
  currently_employed: null,
  has_own_transport: null,
  has_drivers_licence: null,
  availability: [],
  willing_to_relocate: null,
  languages: [],
  certifications: [],
  notice_period: null,
  earliest_start_date: null,
}

export const EMPTY_SENSITIVE_DETAILS: SensitiveDetails = { marital_status: null, children_count: null }

export const SEEKER_DETAIL_COLUMNS = [
  'currently_employed', 'has_own_transport', 'has_drivers_licence', 'availability',
  'willing_to_relocate', 'languages', 'certifications', 'notice_period', 'earliest_start_date',
] as const

export const SENSITIVE_DETAILS_NOTICE = 'Optional and voluntary. Only visible to JobLinks admin — never shown to employers or the public.'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const BOOLEAN_FIELDS = ['currently_employed', 'has_own_transport', 'has_drivers_licence', 'willing_to_relocate'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function textList(value: unknown, field: string, max: number): Result<string[]> {
  if (value === null || value === undefined) return { ok: true, value: [] }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return { ok: false, error: `${field} must be a list of text.` }
  const seen = new Set<string>()
  const items: string[] = []
  for (const raw of value as string[]) {
    const item = raw.trim().replace(/\s+/g, ' ')
    if (!item) continue
    if (item.length > 80) return { ok: false, error: `Each ${field} entry must be 80 characters or fewer.` }
    if (seen.has(item.toLowerCase())) continue
    seen.add(item.toLowerCase())
    items.push(item)
  }
  if (items.length > max) return { ok: false, error: `Add at most ${max} ${field}.` }
  return { ok: true, value: items }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Validates the practical details for storage. Only supplied keys are returned. */
export function parseSeekerDetails(input: unknown): Result<Partial<SeekerDetails>> {
  if (!isRecord(input)) return { ok: false, error: 'Invalid profile details.' }
  const unknown = Object.keys(input).filter(key => !(SEEKER_DETAIL_COLUMNS as readonly string[]).includes(key))
  if (unknown.length) return { ok: false, error: `Unknown profile details: ${unknown.join(', ')}` }
  const out: Partial<SeekerDetails> = {}
  for (const field of BOOLEAN_FIELDS) {
    if (!(field in input)) continue
    const value = input[field]
    if (value !== null && typeof value !== 'boolean') return { ok: false, error: `${field} must be yes, no or unanswered.` }
    out[field] = value
  }
  if ('availability' in input) {
    const value = input.availability ?? []
    if (!Array.isArray(value) || value.some(item => !Object.hasOwn(AVAILABILITY_OPTIONS, item as string))) {
      return { ok: false, error: 'Invalid availability.' }
    }
    out.availability = [...new Set(value as Availability[])]
  }
  for (const [field, max] of [['languages', 20], ['certifications', 30]] as const) {
    if (!(field in input)) continue
    const list = textList(input[field], field, max)
    if (!list.ok) return list
    out[field] = list.value
  }
  if ('notice_period' in input) {
    const value = input.notice_period
    if (value !== null && value !== '' && !Object.hasOwn(NOTICE_PERIOD_OPTIONS, value as string)) return { ok: false, error: 'Invalid notice period.' }
    out.notice_period = (value || null) as NoticePeriod | null
  }
  if ('earliest_start_date' in input) {
    const value = input.earliest_start_date
    if (value !== null && value !== '' && (typeof value !== 'string' || !isCalendarDate(value))) return { ok: false, error: 'Earliest start date must be a valid date.' }
    out.earliest_start_date = (value || null) as string | null
  }
  return { ok: true, value: out }
}

/** Validates the sensitive details. Blank values are stored as NULL. */
export function parseSensitiveDetails(input: unknown): Result<SensitiveDetails> {
  if (!isRecord(input)) return { ok: false, error: 'Invalid personal details.' }
  const unknown = Object.keys(input).filter(key => key !== 'marital_status' && key !== 'children_count')
  if (unknown.length) return { ok: false, error: `Unknown personal details: ${unknown.join(', ')}` }
  const marital = input.marital_status ?? null
  if (marital !== null && marital !== '' && !Object.hasOwn(MARITAL_STATUS_OPTIONS, marital as string)) return { ok: false, error: 'Invalid marital status.' }
  const children = input.children_count ?? null
  if (children !== null && children !== '' && (!Number.isInteger(children) || (children as number) < 0 || (children as number) > 20)) {
    return { ok: false, error: 'Number of children must be a whole number from 0 to 20.' }
  }
  return { ok: true, value: {
    marital_status: (marital || null) as MaritalStatus | null,
    children_count: children === '' ? null : children as number | null,
  } }
}

/** Normalizes a seeker_profiles row (possibly without the new columns) for display/editing. */
export function seekerDetailsFromRow(row: Record<string, unknown> | null | undefined): SeekerDetails {
  if (!row) return { ...EMPTY_SEEKER_DETAILS }
  const bool = (value: unknown) => typeof value === 'boolean' ? value : null
  const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  return {
    currently_employed: bool(row.currently_employed),
    has_own_transport: bool(row.has_own_transport),
    has_drivers_licence: bool(row.has_drivers_licence),
    availability: list(row.availability).filter((item): item is Availability => Object.hasOwn(AVAILABILITY_OPTIONS, item)),
    willing_to_relocate: bool(row.willing_to_relocate),
    languages: list(row.languages),
    certifications: list(row.certifications),
    notice_period: typeof row.notice_period === 'string' && Object.hasOwn(NOTICE_PERIOD_OPTIONS, row.notice_period) ? row.notice_period as NoticePeriod : null,
    earliest_start_date: typeof row.earliest_start_date === 'string' ? row.earliest_start_date : null,
  }
}

export function sensitiveDetailsFromRow(row: Record<string, unknown> | null | undefined): SensitiveDetails {
  if (!row) return { ...EMPTY_SENSITIVE_DETAILS }
  return {
    marital_status: typeof row.marital_status === 'string' && Object.hasOwn(MARITAL_STATUS_OPTIONS, row.marital_status) ? row.marital_status as MaritalStatus : null,
    children_count: typeof row.children_count === 'number' ? row.children_count : null,
  }
}

const yesNo = (value: boolean | null) => value === null ? null : value ? 'Yes' : 'No'

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })
}

/** Label/value rows for answered practical details, in display order. */
export function seekerDetailRows(details: SeekerDetails): { label: string; value: string }[] {
  const rows: [string, string | null][] = [
    ['Currently employed', yesNo(details.currently_employed)],
    ['Own transport', yesNo(details.has_own_transport)],
    ["Driver's licence", yesNo(details.has_drivers_licence)],
    ['Availability', details.availability.length ? details.availability.map(item => AVAILABILITY_OPTIONS[item]).join(', ') : null],
    ['Willing to relocate', yesNo(details.willing_to_relocate)],
    ['Languages', details.languages.length ? details.languages.join(', ') : null],
    ['Certifications', details.certifications.length ? details.certifications.join(', ') : null],
    ['Notice period', details.notice_period ? NOTICE_PERIOD_OPTIONS[details.notice_period] : null],
    ['Earliest start date', details.earliest_start_date ? formatDate(details.earliest_start_date) : null],
  ]
  return rows.filter((row): row is [string, string] => row[1] !== null).map(([label, value]) => ({ label, value }))
}

export function sensitiveDetailRows(details: SensitiveDetails): { label: string; value: string }[] {
  const rows: [string, string | null][] = [
    ['Marital status', details.marital_status ? MARITAL_STATUS_OPTIONS[details.marital_status] : null],
    ['Number of children', details.children_count === null ? null : String(details.children_count)],
  ]
  return rows.filter((row): row is [string, string] => row[1] !== null).map(([label, value]) => ({ label, value }))
}
