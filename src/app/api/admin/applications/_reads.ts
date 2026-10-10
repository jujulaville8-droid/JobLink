import type { createAdminClient } from '@/lib/supabase/admin'
import {
  APPLICATION_TIME_ZONE, applicationScope,
  type ApplicantQuery, type ApplicationJobRow, type ApplicationOverview, type JobApplicantRow, type JobApplicants, type OverviewQuery,
} from '@/lib/admin-applications'
import { nullableText, record, relation, rows, text, uuid } from './_data'

type AdminClient = ReturnType<typeof createAdminClient>
type BatchQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  gt(column: string, value: string): BatchQuery
  order(column: string, options: { ascending: boolean }): BatchQuery
  limit(count: number): BatchQuery
  abortSignal(signal: AbortSignal): BatchQuery
  retry(enabled: boolean): BatchQuery
}

// Shared by BOTH consistency passes, including their terminating empty reads.
export const APPLICATION_READ_BUDGET = { rows: 50_000, requests: 160, milliseconds: 15_000, batchSize: 1_000 } as const
const JOB_FIELDS = 'id,title,status,created_at,company:companies!inner(id,company_name)'
const OVERVIEW_APPLICATION_FIELDS = 'id,job_id,status,applied_at,job_listings!inner(company_id,status)'
const APPLICANT_FIELDS = 'id,status,applied_at,applicant:seeker_profiles!inner(id,first_name,last_name)'
const DAY = 86_400_000
const clock = new Intl.DateTimeFormat('en-US', {
  timeZone: APPLICATION_TIME_ZONE, era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const unavailable = () => new Error('Application read unavailable')
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const id = (value: unknown) => uuid(value).toLowerCase()
function timestamp(value: unknown) {
  const result = text(value)
  if (!Number.isFinite(Date.parse(result))) throw unavailable()
  return result
}
function compareTimestamp(a: string, b: string) {
  // PostgreSQL preserves microseconds; Date alone would make distinct values ties.
  const milliseconds = Date.parse(a) - Date.parse(b)
  if (milliseconds) return milliseconds
  const remainder = (value: string) => (value.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1] ?? '').slice(3).padEnd(3, '0')
  return compare(remainder(a), remainder(b))
}
function calendarParts(milliseconds: number) {
  const parts = clock.formatToParts(new Date(milliseconds))
  const part = (key: string) => parts.find(item => item.type === key)!.value
  const year = Number(part('year')) * (part('era') === 'BC' ? -1 : 1) + (part('era') === 'BC' ? 1 : 0)
  return { year, month: Number(part('month')), day: Number(part('day')), hour: Number(part('hour')), minute: Number(part('minute')), second: Number(part('second')) }
}
function midnight(milliseconds: number) {
  let candidate = milliseconds
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = calendarParts(candidate)
    const represented = new Date(0)
    represented.setUTCFullYear(parts.year, parts.month - 1, parts.day)
    represented.setUTCHours(parts.hour, parts.minute, parts.second, 0)
    const difference = milliseconds - represented.getTime()
    if (difference === 0) return new Date(candidate).toISOString()
    candidate += difference
  }
  throw unavailable()
}
function bounds(query: { from: string; to: string }) {
  return { start: midnight(Date.parse(`${query.from}T00:00:00Z`)), end: midnight(Date.parse(`${query.to}T00:00:00Z`) + DAY) }
}
function calendarDate(value: string) {
  const parts = calendarParts(Date.parse(value))
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

class ReadBudget {
  controller = new AbortController()
  requests = 0
  rows = 0
  started = Date.now()
  timer: ReturnType<typeof setTimeout>
  constructor(private parent?: AbortSignal) {
    this.timer = setTimeout(this.abort, APPLICATION_READ_BUDGET.milliseconds)
    parent?.addEventListener('abort', this.abort, { once: true })
    if (parent?.aborted) this.abort()
  }
  abort = () => this.controller.abort()
  check() {
    if (this.controller.signal.aborted || Date.now() - this.started >= APPLICATION_READ_BUDGET.milliseconds) throw unavailable()
  }
  begin() {
    this.check()
    if (++this.requests > APPLICATION_READ_BUDGET.requests) throw unavailable()
  }
  consume(count: number) {
    this.check()
    this.rows += count
    if (this.rows > APPLICATION_READ_BUDGET.rows) throw unavailable()
  }
  close() {
    clearTimeout(this.timer)
    this.parent?.removeEventListener('abort', this.abort)
    this.abort()
  }
}

async function scan<T extends { id: string }>(build: () => BatchQuery, project: (row: unknown) => T, budget: ReadBudget): Promise<T[]> {
  const result: T[] = []
  let after: string | null = null
  while (true) {
    budget.begin()
    let query = build().order('id', { ascending: true }).limit(APPLICATION_READ_BUDGET.batchSize)
    if (after) query = query.gt('id', after)
    const response = await query.abortSignal(budget.controller.signal).retry(false)
    if (response.error) throw unavailable()
    const batch = rows(response.data)
    budget.consume(batch.length)
    if (batch.length === 0) return result
    for (const raw of batch) {
      const row = project(raw)
      if (after && compare(row.id, after) <= 0) throw unavailable()
      result.push(row)
      after = row.id
    }
    // A shorter page can be the backend's row cap. Only an empty page is terminal.
  }
}

function jobRow(value: unknown): ApplicationJobRow {
  const row = record(value)
  const company = relation(row.company)
  if (!company) throw unavailable()
  return {
    id: id(row.id), title: text(row.title), status: text(row.status), createdAt: timestamp(row.created_at),
    company: { id: id(company.id), name: text(company.company_name) }, applicationCount: 0, latestApplicationAt: null,
  }
}
function jobQuery(admin: AdminClient, query: Pick<OverviewQuery, 'companyId' | 'jobId' | 'jobStatus'>) {
  let read = admin.from('job_listings').select(JOB_FIELDS)
  if (query.companyId) read = read.eq('company_id', query.companyId)
  if (query.jobId) read = read.eq('id', query.jobId)
  if (query.jobStatus !== 'all') read = read.eq('status', query.jobStatus)
  return read
}
function applicationRow(value: unknown) {
  const row = record(value)
  return { id: id(row.id), jobId: id(row.job_id), status: text(row.status), appliedAt: timestamp(row.applied_at) }
}
function applicantRow(value: unknown): JobApplicantRow {
  const row = record(value)
  const applicant = relation(row.applicant)
  if (!applicant) throw unavailable()
  return { id: id(row.id), status: text(row.status), appliedAt: timestamp(row.applied_at), applicant: {
    id: id(applicant.id), firstName: nullableText(applicant.first_name), lastName: nullableText(applicant.last_name),
  } }
}

/** No new database objects are needed. Call only AFTER requireAdmin().
 * REST cannot share a transaction snapshot. Two identical complete projections
 * detect observable insert/delete/update drift; a changed read fails closed.
 * This is not a transactional snapshot guarantee (e.g. an ABA change between reads).
 */
async function consistent<T>(read: (budget: ReadBudget) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const budget = new ReadBudget(signal)
  try {
    const first = await read(budget)
    const second = await read(budget)
    budget.check()
    if (JSON.stringify(first) !== JSON.stringify(second)) throw unavailable()
    return second
  } finally { budget.close() }
}

export async function readApplicationOverview(admin: AdminClient, query: OverviewQuery, signal?: AbortSignal): Promise<ApplicationOverview> {
  const { start, end } = bounds(query)
  const snapshot = await consistent(async budget => {
    const jobs = await scan(() => jobQuery(admin, query), jobRow, budget)
    const matching = jobs.filter(job => job.title.toLowerCase().includes(query.q.toLowerCase()) || job.company.name.toLowerCase().includes(query.q.toLowerCase()))
    const applications = matching.length ? await scan(() => {
      let read = admin.from('applications').select(OVERVIEW_APPLICATION_FIELDS).gte('applied_at', start).lt('applied_at', end)
      if (query.status !== 'all') read = read.eq('status', query.status)
      if (query.jobId) read = read.eq('job_id', query.jobId)
      if (query.companyId) read = read.eq('job_listings.company_id', query.companyId)
      if (query.jobStatus !== 'all') read = read.eq('job_listings.status', query.jobStatus)
      return read
    }, applicationRow, budget) : []
    return { jobs, applications }
  }, signal)
  const jobs = snapshot.jobs.filter(job => job.title.toLowerCase().includes(query.q.toLowerCase()) || job.company.name.toLowerCase().includes(query.q.toLowerCase()))
  const byId = new Map(jobs.map(job => [job.id, job]))
  const daily = new Map<string, number>()
  const companies = new Set<string>()
  const summary: ApplicationOverview['summary'] = { applications: 0, jobsWithApplications: 0, companiesWithApplications: 0, statusCounts: { applied: 0, interview: 0, hold: 0, rejected: 0 } }
  for (const application of snapshot.applications) {
    const job = byId.get(application.jobId)
    if (!job) continue
    job.applicationCount++
    if (!job.latestApplicationAt || compareTimestamp(application.appliedAt, job.latestApplicationAt) > 0) job.latestApplicationAt = application.appliedAt
    summary.applications++
    if (Object.hasOwn(summary.statusCounts, application.status)) summary.statusCounts[application.status as keyof typeof summary.statusCounts]++
    companies.add(job.company.id)
    const day = calendarDate(application.appliedAt)
    daily.set(day, (daily.get(day) ?? 0) + 1)
  }
  summary.jobsWithApplications = jobs.filter(job => job.applicationCount > 0).length
  summary.companiesWithApplications = companies.size
  jobs.sort((a, b) => {
    let order = 0
    switch (query.sort) {
      case 'latest': order = a.latestApplicationAt && b.latestApplicationAt ? compareTimestamp(b.latestApplicationAt, a.latestApplicationAt) : a.latestApplicationAt ? -1 : b.latestApplicationAt ? 1 : 0; break
      case 'applications_desc': order = b.applicationCount - a.applicationCount; break
      case 'applications_asc': order = a.applicationCount - b.applicationCount; break
      case 'job_asc': order = compare(a.title.toLowerCase(), b.title.toLowerCase()); break
      case 'company_asc': order = compare(a.company.name.toLowerCase(), b.company.name.toLowerCase()); break
      case 'newest_job': order = compareTimestamp(b.createdAt, a.createdAt); break
    }
    return order || compare(a.id, b.id)
  })
  const trend = []
  for (let day = Date.parse(`${query.from}T00:00:00Z`); day <= Date.parse(`${query.to}T00:00:00Z`); day += DAY) {
    const date = new Date(day).toISOString().slice(0, 10)
    trend.push({ date, count: daily.get(date) ?? 0 })
  }
  return { scope: applicationScope(query), page: query.page, limit: query.limit, totalJobs: jobs.length, summary, trend, jobs: jobs.slice((query.page - 1) * query.limit, query.page * query.limit) }
}

export async function readJobApplicants(admin: AdminClient, jobId: string, query: ApplicantQuery, signal?: AbortSignal): Promise<JobApplicants | null> {
  const { start, end } = bounds(query)
  const snapshot = await consistent(async budget => {
    const jobs = await scan(() => jobQuery(admin, { jobId, companyId: null, jobStatus: 'all' }), jobRow, budget)
    const applications = jobs.length ? await scan(() => {
      let read = admin.from('applications').select(APPLICANT_FIELDS).eq('job_id', jobId).gte('applied_at', start).lt('applied_at', end)
      if (query.status !== 'all') read = read.eq('status', query.status)
      return read
    }, applicantRow, budget) : []
    return { jobs, applications }
  }, signal)
  if (!snapshot.jobs.length) return null
  const name = (row: JobApplicantRow) => [row.applicant.firstName, row.applicant.lastName].filter(Boolean).join(' ').trim().toLowerCase()
  const applications = snapshot.applications.filter(row => name(row).includes(query.applicantQ.toLowerCase()))
  applications.sort((a, b) => (query.applicantSort === 'name' ? compare(name(a), name(b))
    : query.applicantSort === 'oldest' ? compareTimestamp(a.appliedAt, b.appliedAt) : compareTimestamp(b.appliedAt, a.appliedAt)) || compare(a.id, b.id))
  const { id, title, status, company } = snapshot.jobs[0]
  return { scope: applicationScope(query), page: query.applicantPage, limit: query.applicantLimit,
    job: { id, title, status, company }, totalCount: applications.length,
    applications: applications.slice((query.applicantPage - 1) * query.applicantLimit, query.applicantPage * query.applicantLimit),
  }
}
