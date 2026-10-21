/** Shared, serializable contracts for the read-only admin Applications area. */
import type { SeekerDetails, SensitiveDetails } from '@/lib/seeker-details'
export const APPLICATION_TIME_ZONE = 'America/Antigua' as const
export const ADMIN_APPLICATION_PAGE_SIZE = 20
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/i

export const APPLICATION_STATUS_LABELS = {
  applied: 'Applied', interview: 'Interview', hold: 'On Hold', rejected: 'Rejected',
} as const
export type ApplicationStatusFilter = 'all' | keyof typeof APPLICATION_STATUS_LABELS
export type JobStatusFilter = 'all' | 'active' | 'closed' | 'pending_approval'
export type OverviewSort = 'latest' | 'applications_desc' | 'applications_asc' | 'job_asc' | 'company_asc' | 'newest_job'
export type ApplicantSort = 'newest' | 'oldest' | 'name'

export interface ApplicationDateScope { from: string; to: string; timeZone: typeof APPLICATION_TIME_ZONE }
export interface OverviewQuery {
  from: string; to: string; q: string; companyId: string | null; jobId: string | null
  status: ApplicationStatusFilter; jobStatus: JobStatusFilter; sort: OverviewSort; page: number; limit: number
}
export type TriStateFilter = 'all' | 'yes' | 'no' | 'unknown'
export type AvailabilityFilter = 'all' | 'full_time' | 'part_time' | 'shifts' | 'weekends'
export interface ApplicantQuery {
  from: string; to: string; status: ApplicationStatusFilter; applicantQ: string
  applicantSort: ApplicantSort; applicantPage: number; applicantLimit: number
  /** Optional profile-detail filters; 'unknown' means the seeker did not answer. */
  employed?: TriStateFilter; transport?: TriStateFilter; availability?: AvailabilityFilter
}
export interface FilterQuery { kind: 'company' | 'job'; q: string; companyId: string | null; page: number; limit: number }
export interface ApplicationJob {
  id: string; title: string; status: string; company: { id: string; name: string }
}
export interface ApplicationJobRow extends ApplicationJob {
  createdAt: string; applicationCount: number; latestApplicationAt: string | null
}
export interface ApplicationOverview {
  scope: ApplicationDateScope; page: number; limit: number; totalJobs: number
  summary: {
    applications: number; jobsWithApplications: number; companiesWithApplications: number
    statusCounts: Record<keyof typeof APPLICATION_STATUS_LABELS, number>
  }
  jobs: ApplicationJobRow[]; trend: { date: string; count: number }[]
}
export interface JobApplicantRow {
  id: string; appliedAt: string; status: string
  applicant: {
    id: string; firstName: string | null; lastName: string | null
    currentlyEmployed?: boolean | null; hasOwnTransport?: boolean | null; availability?: string[]
  }
}
export interface JobApplicants {
  scope: ApplicationDateScope; page: number; limit: number; job: ApplicationJob
  totalCount: number; applications: JobApplicantRow[]
}
export interface ApplicationDetail {
  id: string; jobId: string; appliedAt: string; status: string; coverLetterText: string | null
  job: { id: string; title: string; company: { id: string; name: string } | null } | null
  applicant: {
    id: string; userId: string; firstName: string | null; lastName: string | null
    email: string | null; phone: string | null; location: string | null
  } | null
  resume: { label: 'Current résumé'; uploadedHref: string | null; builtHref: string | null }
  /** Whether the application was emailed to the employer; 'not_tracked' before tracking existed. */
  notificationTracking: 'not_tracked' | EmployerForward
  /** Admin-only operational status. This is not a screening result or inbox-delivery receipt. */
  employerOutboxStatus?: EmployerOutboxStatus
  /** Optional practical profile details (also visible to the employer). */
  profileDetails?: SeekerDetails | null
  /** Optional sensitive details. Admin-only; never send to employer views. */
  sensitiveDetails?: SensitiveDetails | null
}
export interface EmployerForward {
  status: 'sent' | 'not_sent'; attemptedAt: string; forwardedAt: string | null
}
const EMPLOYER_OUTBOX_STATES = ['pending', 'claimed', 'ready', 'sending', 'accepted', 'uncertain', 'blocked', 'cancelled'] as const
const EMPLOYER_OUTBOX_ERROR_CODES = [
  'APPLICATION_DELETED', 'LEASE_EXPIRED_SENDING', 'CLAIM_GATE_REJECTED', 'SEND_GATE_REJECTED',
  'INVALID_PERSISTED_PAYLOAD', 'NOT_SENT', 'RATE_LIMITED', 'UNCERTAIN', 'CONCURRENT_CONFLICT',
  'REJECTED', 'PAYLOAD_CONFLICT', 'INVALID_OUTCOME', 'RECONCILED_ACCEPTED', 'RECONCILED_NOT_SENT',
] as const
export interface EmployerOutboxStatus {
  state: typeof EMPLOYER_OUTBOX_STATES[number]
  attempts: number
  firstSendAt: string | null
  acceptedAt: string | null
  nextAttemptAt: string | null
  lastErrorCode: typeof EMPLOYER_OUTBOX_ERROR_CODES[number] | null
}

/** Allowlist every operational field; never reflect provider diagnostics or stored payloads. */
export function readEmployerOutboxStatus(value: unknown): EmployerOutboxStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (!EMPLOYER_OUTBOX_STATES.includes(row.state as EmployerOutboxStatus['state'])
    || typeof row.attempts !== 'number' || !Number.isInteger(row.attempts) || row.attempts < 0 || row.attempts > 4) return null
  const timestamp = (input: unknown): string | null => {
    if (typeof input !== 'string' || input.length > 40
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(input)) return null
    const date = new Date(input)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
  }
  return {
    state: row.state as EmployerOutboxStatus['state'], attempts: row.attempts,
    firstSendAt: timestamp(row.firstSendAt), acceptedAt: timestamp(row.acceptedAt), nextAttemptAt: timestamp(row.nextAttemptAt),
    lastErrorCode: EMPLOYER_OUTBOX_ERROR_CODES.includes(row.lastErrorCode as NonNullable<EmployerOutboxStatus['lastErrorCode']>)
      ? row.lastErrorCode as NonNullable<EmployerOutboxStatus['lastErrorCode']> : null,
  }
}
export interface ApplicationFilterOptions { items: { id: string; name: string }[]; page: number; limit: number; totalCount: number }
export type QueryResult<T> = { value: T; error?: never } | { error: string; value?: never }

const DAY = 86_400_000
const STATUSES = ['all', 'applied', 'interview', 'hold', 'rejected'] as const
const JOB_STATUSES = ['all', 'active', 'closed', 'pending_approval'] as const
const OVERVIEW_SORTS = ['latest', 'applications_desc', 'applications_asc', 'job_asc', 'company_asc', 'newest_job'] as const
const APPLICANT_SORTS = ['newest', 'oldest', 'name'] as const
const TRI_STATES = ['all', 'yes', 'no', 'unknown'] as const
const AVAILABILITY_FILTERS = ['all', 'full_time', 'part_time', 'shifts', 'weekends'] as const

export function defaultApplicationDates(now = new Date()): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: APPLICATION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (name: string) => parts.find(value => value.type === name)!.value
  const to = `${part('year')}-${part('month')}-${part('day')}`
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 29 * DAY).toISOString().slice(0, 10)
  return { from, to }
}

function read(params: URLSearchParams, key: string, fallback = ''): string {
  if (params.getAll(key).length > 1) throw new Error(`Provide ${key} only once.`)
  return params.get(key) ?? fallback
}
function choice<T extends string>(params: URLSearchParams, key: string, values: readonly T[], fallback: T): T {
  const value = read(params, key, fallback)
  if (!values.includes(value as T)) throw new Error(`Invalid ${key}.`)
  return value as T
}
function integer(params: URLSearchParams, key: string, fallback: number, maximum: number): number {
  const value = read(params, key, String(fallback))
  if (!/^[1-9]\d*(?![\s\S])/.test(value) || Number(value) > maximum) throw new Error(`Invalid ${key}.`)
  return Number(value)
}
function search(params: URLSearchParams, key: string): string {
  const value = read(params, key).trim()
  if (value.length > 160) throw new Error('Search must be 160 characters or fewer.')
  return value
}
function identifier(params: URLSearchParams, key: string): string | null {
  const value = read(params, key)
  if (value && !UUID_PATTERN.test(value)) throw new Error(`Invalid ${key}.`)
  return value || null
}
function dateScope(params: URLSearchParams, now: Date) {
  const defaults = defaultApplicationDates(now)
  const from = read(params, 'from', defaults.from)
  const to = read(params, 'to', defaults.to)
  if (params.has('from') !== params.has('to')) throw new Error('Provide both start and end dates.')
  for (const value of [from, to]) {
    const timestamp = Date.parse(`${value}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) === 0 || !Number.isFinite(timestamp)
      || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error('Enter valid calendar dates.')
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1
  if (days < 1 || days > 366) throw new Error('Choose a date range of 1 to 366 days.')
  return { from, to }
}
function parse<T>(work: () => T): QueryResult<T> {
  try { return { value: work() } } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid filters.' }
  }
}

export function parseOverviewQuery(params: URLSearchParams, now = new Date()): QueryResult<OverviewQuery> {
  return parse(() => ({
    ...dateScope(params, now), q: search(params, 'q'), companyId: identifier(params, 'companyId'), jobId: identifier(params, 'jobId'),
    status: choice(params, 'status', STATUSES, 'all'), jobStatus: choice(params, 'jobStatus', JOB_STATUSES, 'all'),
    sort: choice(params, 'sort', OVERVIEW_SORTS, 'latest'), page: integer(params, 'page', 1, 10_000),
    limit: integer(params, 'limit', ADMIN_APPLICATION_PAGE_SIZE, 50),
  }))
}
export function parseApplicantQuery(params: URLSearchParams, now = new Date()): QueryResult<ApplicantQuery> {
  return parse(() => ({
    ...dateScope(params, now), status: choice(params, 'status', STATUSES, 'all'),
    applicantQ: search(params, 'applicantQ'), applicantSort: choice(params, 'applicantSort', APPLICANT_SORTS, 'newest'),
    applicantPage: integer(params, 'applicantPage', 1, 10_000), applicantLimit: integer(params, 'applicantLimit', ADMIN_APPLICATION_PAGE_SIZE, 50),
    employed: choice(params, 'employed', TRI_STATES, 'all'), transport: choice(params, 'transport', TRI_STATES, 'all'),
    availability: choice(params, 'availability', AVAILABILITY_FILTERS, 'all'),
  }))
}
export function parseFilterQuery(params: URLSearchParams): QueryResult<FilterQuery> {
  return parse(() => ({
    kind: choice(params, 'kind', ['company', 'job'] as const, 'company'), q: search(params, 'q'), companyId: identifier(params, 'companyId'),
    page: integer(params, 'page', 1, 10_000), limit: integer(params, 'limit', ADMIN_APPLICATION_PAGE_SIZE, 50),
  }))
}
export function applicationScope(query: { from: string; to: string }): ApplicationDateScope {
  return { from: query.from, to: query.to, timeZone: APPLICATION_TIME_ZONE }
}
export function applicantName(applicant: { firstName: string | null; lastName: string | null }): string {
  return [applicant.firstName, applicant.lastName].filter(Boolean).join(' ').trim() || 'Name unavailable'
}
export function applicationStatusLabel(status: string): string {
  return APPLICATION_STATUS_LABELS[status as keyof typeof APPLICATION_STATUS_LABELS] ?? 'Status unavailable'
}

/** Applies the optional profile-detail filters to an applicant. */
export function matchesApplicantDetails(applicant: JobApplicantRow['applicant'], query: Pick<ApplicantQuery, 'employed' | 'transport' | 'availability'>): boolean {
  const tri = (filter: TriStateFilter | undefined, value: boolean | null | undefined) =>
    !filter || filter === 'all' || (filter === 'unknown' ? value == null : value === (filter === 'yes'))
  if (!tri(query.employed, applicant.currentlyEmployed)) return false
  if (!tri(query.transport, applicant.hasOwnTransport)) return false
  if (query.availability && query.availability !== 'all' && !(applicant.availability ?? []).includes(query.availability)) return false
  return true
}
