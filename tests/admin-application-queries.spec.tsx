// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APPLICATION_READ_BUDGET, readApplicationOverview, readJobApplicants } from '@/app/api/admin/applications/_reads'
import type { ApplicantQuery, OverviewQuery } from '@/lib/admin-applications'

const uid = (kind: number, n: number) => `${kind}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const companyId = (n: number) => uid(1, n)
const jobId = (n: number) => uid(2, n)
const seekerId = (n: number) => uid(3, n)
const applicationId = (n: number) => uid(4, n)
type Job = { id: string; company_id: string; title: string; status: string; created_at: string }
type Seeker = { id: string; first_name: string | null; last_name: string | null }
type Application = { id: string; job_id: string; seeker_id: string; status: string; applied_at: string }
type Read = { url: URL; signal?: AbortSignal | null; method: string; body: unknown }
let companies: { id: string; company_name: string }[]
let jobs: Job[]
let seekers: Seeker[]
let apps: Application[]
let reads: Read[]
let cap: number
let beforeRead: ((read: Read) => void) | undefined
let transform: ((rows: Record<string, unknown>[], read: Read) => unknown) | undefined
const privateDiagnostic = 'private-applicant@example.test / internal diagnostic'

// Real Supabase/PostgREST URL construction with a synthetic transport; no network.
// Short server caps and unexpected extra fields exercise completeness/projection.
async function syntheticFetch(input: RequestInfo | URL, options?: RequestInit) {
  const url = new URL(String(input))
  const read = { url, signal: options?.signal, method: options?.method ?? 'GET', body: options?.body }
  reads.push(read)
  beforeRead?.(read)
  const table = url.pathname.split('/').at(-1)
  const select = url.searchParams.get('select')!
  let result: Record<string, unknown>[]
  if (table === 'job_listings') result = jobs.flatMap(job => {
    const company = companies.find(item => item.id === job.company_id)
    return company ? [{ ...job, company: { ...company, email: privateDiagnostic }, private_note: privateDiagnostic }] : []
  })
  else if (table === 'applications') result = apps.flatMap(application => {
    const job = jobs.find(item => item.id === application.job_id)
    const applicant = seekers.find(item => item.id === application.seeker_id)
    if (select.includes('seeker_profiles') ? !applicant : !job) return []
    return [{ ...application, job_listings: job, applicant: { ...applicant, email: privateDiagnostic, cv_url: 'private/storage/path.pdf' }, cover_letter_text: privateDiagnostic }]
  })
  else throw new Error(`Unexpected synthetic table: ${table}`)
  for (const [column, expression] of url.searchParams) {
    if (['select', 'order', 'limit'].includes(column)) continue
    const dot = expression.indexOf('.')
    const operator = expression.slice(0, dot)
    const expected = expression.slice(dot + 1)
    result = result.filter(row => {
      const value = column.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown>)?.[key], row)
      if (operator === 'eq') return value === expected
      if (operator === 'gt') return String(value) > expected
      if (operator === 'gte') return Date.parse(String(value)) >= Date.parse(expected)
      if (operator === 'lt') return Date.parse(String(value)) < Date.parse(expected)
      throw new Error(`Unexpected synthetic filter: ${operator}`)
    })
  }
  expect(url.searchParams.get('order')).toBe('id.asc')
  result.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  result = result.slice(0, Math.min(cap, Number(url.searchParams.get('limit'))))
  return Response.json(transform ? transform(result, read) : result)
}
const client = () => createClient('https://synthetic.invalid', 'synthetic-test-key', {
  auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: syntheticFetch },
})
const overviewDefaults: OverviewQuery = {
  from: '2026-10-08', to: '2026-10-08', q: '', companyId: null, jobId: null,
  status: 'all', jobStatus: 'all', sort: 'latest', page: 1, limit: 20,
}
const applicantDefaults: ApplicantQuery = {
  from: '2026-10-08', to: '2026-10-08', status: 'all', applicantQ: '', applicantSort: 'newest', applicantPage: 1, applicantLimit: 20,
}
type OverviewOptions = { start: string; end: string; search: string; company: string; status: OverviewQuery['status']; jobStatus: OverviewQuery['jobStatus']; sort: OverviewQuery['sort']; page: number; size: number; job: string }
type DetailOptions = { job: string; start: string; end: string; status: ApplicantQuery['status']; search: string; sort: ApplicantQuery['applicantSort']; page: number; size: number }
function overview(values: Partial<OverviewOptions> = {}, signal?: AbortSignal) {
  const query = { ...overviewDefaults }
  const mapping = { start: 'from', end: 'to', search: 'q', company: 'companyId', status: 'status', jobStatus: 'jobStatus', sort: 'sort', page: 'page', size: 'limit', job: 'jobId' } as const
  Object.entries(values).forEach(([key, value]) => Object.assign(query, { [mapping[key as keyof typeof mapping]]: value }))
  return readApplicationOverview(client(), query, signal)
}
function details(values: Partial<DetailOptions> = {}, signal?: AbortSignal) {
  const query = { ...applicantDefaults }
  const mapping = { start: 'from', end: 'to', status: 'status', search: 'applicantQ', sort: 'applicantSort', page: 'applicantPage', size: 'applicantLimit' } as const
  Object.entries(values).filter(([key]) => key !== 'job').forEach(([key, value]) => Object.assign(query, { [mapping[key as keyof typeof mapping]]: value }))
  return readJobApplicants(client(), values.job ?? jobId(1), query, signal)
}

beforeEach(() => {
  reads = []; cap = 2; beforeRead = undefined; transform = undefined
  companies = [
    { id: companyId(1), company_name: 'Zulu Works' }, { id: companyId(2), company_name: 'alpha Group' },
    { id: companyId(3), company_name: 'Percent%_\\Co' },
  ]
  jobs = [
    [1, 1, 'Zulu Chef', 'active', 1], [2, 1, 'Beta Cook', 'active', 2],
    [3, 2, 'alpha Cook', 'closed', 3], [4, 3, '100%_\\ Chef', 'pending_approval', 4],
    [5, 2, 'Zero applicants', 'active', 5], [6, 1, 'Same Title', 'active', 5], [7, 2, 'same title', 'active', 5],
  ].map(([id, company, title, status, day]) => ({ id: jobId(Number(id)), company_id: companyId(Number(company)), title: String(title), status: String(status), created_at: `2026-10-0${day}T12:00:00Z` }))
  seekers = [
    ['Before', 'Boundary'], [null, 'Zulu'], ['Amy', null], [null, null], ['After', 'Boundary'],
    ['ANN', 'Able'], ['ann', 'able'], ['Percent%_\\', 'Name'], ['100%_\\', 'Person'], ['Rita', 'Stone'], ['Rita', 'Stone'],
  ].map(([first_name, last_name], index) => ({ id: seekerId(index + 1), first_name, last_name }))
  apps = [
    [1, 1, 'applied', '2026-10-08T03:59:59.999Z'], [2, 1, 'interview', '2026-10-08T04:00:00Z'],
    [3, 1, 'hold', '2026-10-08T18:00:00Z'], [4, 1, 'rejected', '2026-10-09T03:59:59.999Z'],
    [5, 1, 'applied', '2026-10-09T04:00:00Z'], [6, 2, 'applied', '2026-10-08T12:00:00Z'],
    [7, 2, 'applied', '2026-10-08T12:00:00Z'], [8, 3, 'interview', '2026-10-08T12:00:00Z'],
    [9, 4, 'hold', '2026-10-08T12:00:00Z'], [10, 6, 'applied', '2026-10-08T12:00:00Z'], [11, 7, 'applied', '2026-10-08T12:00:00Z'],
  ].map(([id, job, status, applied_at]) => ({ id: applicationId(Number(id)), job_id: jobId(Number(job)), seeker_id: seekerId(Number(id)), status: String(status), applied_at: String(applied_at) }))
})
afterEach(() => {
  for (const read of reads) {
    expect(read.url.origin).toBe('https://synthetic.invalid')
    expect(['/rest/v1/job_listings', '/rest/v1/applications']).toContain(read.url.pathname)
    expect(read.method).toBe('GET')
    expect(read.body).toBeUndefined()
    expect(read.url.searchParams.get('limit')).toBe(String(APPLICATION_READ_BUDGET.batchSize))
    expect(read.url.searchParams.has('offset')).toBe(false)
    expect(read.url.searchParams.get('select')).not.toMatch(/\*|email|phone|location|cv_|cover_letter|users/)
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('admin application overview direct reads', () => {
  it('counts the full application set and retains jobs with no applicants', async () => {
    const result = await overview()
    expect(result.summary).toEqual({
      applications: 9, jobsWithApplications: 6, companiesWithApplications: 3,
      statusCounts: { applied: 4, interview: 2, hold: 2, rejected: 1 },
    })
    expect(result.totalJobs).toBe(7)
    expect(result.jobs.map(job => job.id)).toEqual([1, 2, 3, 4, 6, 7, 5].map(jobId))
    expect(result.jobs.find(job => job.id === jobId(5))).toMatchObject({
      title: 'Zero applicants', applicationCount: 0, latestApplicationAt: null,
      company: { id: companyId(2), name: 'alpha Group' },
    })
    expect(result.trend).toEqual([{ date: '2026-10-08', count: 9 }])
    expect(Date.parse(result.jobs[0].latestApplicationAt!)).toBe(Date.parse('2026-10-09T03:59:59.999Z'))
    expect(Date.parse(result.jobs[0].createdAt)).toBe(Date.parse('2026-10-01T12:00:00Z'))
  })

  it('uses inclusive Antigua calendar dates and fills missing days with zero', async () => {
    {
      const result = await overview({ start: '2026-10-06', end: '2026-10-10' })
      expect(result.summary.applications).toBe(11)
      expect(result.trend).toEqual([
        { date: '2026-10-06', count: 0 }, { date: '2026-10-07', count: 1 },
        { date: '2026-10-08', count: 9 }, { date: '2026-10-09', count: 1 },
        { date: '2026-10-10', count: 0 },
      ])
      expect((await details())!.applications.map(app => app.id)).toEqual([4, 3, 2].map(applicationId))
    }
  })

  it('applies the selected current status to every summary count while retaining zero rows', async () => {
    const result = await overview({ status: 'interview' })
    expect(result.summary).toEqual({
      applications: 2, jobsWithApplications: 2, companiesWithApplications: 2,
      statusCounts: { applied: 0, interview: 2, hold: 0, rejected: 0 },
    })
    expect(result.totalJobs).toBe(7)
    expect(result.jobs.filter(job => job.applicationCount === 0)).toHaveLength(5)
    expect(result.trend).toEqual([{ date: '2026-10-08', count: 2 }])
    const held = await overview({ status: 'hold' })
    expect(held.summary.statusCounts).toEqual({ applied: 0, interview: 0, hold: 2, rejected: 0 })
  })

  it('combines company and listing-status filters without inferring eligibility from applicants', async () => {
    const result = await overview({ company: companyId(1), jobStatus: 'active', status: 'applied' })
    expect(result.totalJobs).toBe(3)
    expect(result.summary).toEqual({
      applications: 3, jobsWithApplications: 2, companiesWithApplications: 1,
      statusCounts: { applied: 3, interview: 0, hold: 0, rejected: 0 },
    })
    expect(result.jobs.find(job => job.id === jobId(1))!.applicationCount).toBe(0)
    expect((await overview({ jobStatus: 'closed' })).jobs.map(job => job.id)).toEqual([jobId(3)])
    expect((await overview({ jobStatus: 'pending_approval' })).jobs.map(job => job.id)).toEqual([jobId(4)])
  })

  it('filters by exact job ID and returns empty totals for an incompatible company/job pair', async () => {
    const selected = await overview({ job: jobId(1), company: companyId(1) })
    expect(selected.totalJobs).toBe(1)
    expect(selected.jobs.map(job => job.id)).toEqual([jobId(1)])
    expect(selected.summary).toEqual({
      applications: 3, jobsWithApplications: 1, companiesWithApplications: 1,
      statusCounts: { applied: 0, interview: 1, hold: 1, rejected: 1 },
    })
    expect(selected.trend).toEqual([{ date: '2026-10-08', count: 3 }])
    const zeroJob = await overview({ job: jobId(5) })
    expect(zeroJob.totalJobs).toBe(1)
    expect(zeroJob.jobs[0].applicationCount).toBe(0)
    for (const filters of [{ job: jobId(1), company: companyId(2) }, { job: jobId(999) }]) {
      const empty = await overview(filters)
      expect(empty.totalJobs).toBe(0)
      expect(empty.jobs).toEqual([])
      expect(empty.summary).toEqual({
        applications: 0, jobsWithApplications: 0, companiesWithApplications: 0,
        statusCounts: { applied: 0, interview: 0, hold: 0, rejected: 0 },
      })
      expect(empty.trend).toEqual([{ date: '2026-10-08', count: 0 }])
    }
  })

  it.each(['%', '_', '\\', 'pERCENT%_\\cO', '100%_\\'])('treats overview search %j as literal case-insensitive text', async search => {
    const result = await overview({ search })
    expect(result.jobs.map(job => job.id)).toEqual([jobId(4)])
    expect(result.summary.applications).toBe(1)
  })

  it('searches job titles OR company names and returns exact empty structures for no match', async () => {
    expect((await overview({ search: 'ALPHA' })).jobs.map(job => job.id)).toEqual([3, 7, 5].map(jobId))
    expect((await overview({ search: 'bEtA cOoK' })).jobs.map(job => job.id)).toEqual([jobId(2)])
    const result = await overview({ search: 'does not exist' })
    expect(result.jobs).toEqual([])
    expect(result.totalJobs).toBe(0)
    expect(result.summary).toEqual({
      applications: 0, jobsWithApplications: 0, companiesWithApplications: 0,
      statusCounts: { applied: 0, interview: 0, hold: 0, rejected: 0 },
    })
    expect(result.trend).toEqual([{ date: '2026-10-08', count: 0 }])
    expect((await overview({ company: companyId(999) })).totalJobs).toBe(0)
  })

  it.each([
    ['latest', [1, 2, 3, 4, 6, 7, 5]], ['applications_desc', [1, 2, 3, 4, 6, 7, 5]],
    ['applications_asc', [5, 3, 4, 6, 7, 2, 1]], ['job_asc', [4, 3, 2, 6, 7, 5, 1]],
    ['company_asc', [3, 5, 7, 4, 1, 2, 6]], ['newest_job', [5, 6, 7, 4, 3, 2, 1]],
  ] as const)('sorts globally by %s with deterministic ascending ID ties', async (sort, ids) => {
    const result = await overview({ sort, page: 2, size: 2 })
    expect(result.jobs.map(job => job.id)).toEqual(ids.slice(2, 4).map(jobId))
    expect((await overview({ sort })).jobs.map(job => job.id)).toEqual(ids.map(jobId))
    expect(result.totalJobs).toBe(7)
    expect(result.summary.applications).toBe(9)
  })

  it('preserves complete summaries and trends when the requested page is beyond the last row', async () => {
    const result = await overview({ page: 10_000, size: 50 })
    expect(result.jobs).toEqual([])
    expect(result.totalJobs).toBe(7)
    expect(result.summary.applications).toBe(9)
    expect(result.trend).toEqual([{ date: '2026-10-08', count: 9 }])
  })

  it('aggregates more than 1000 applications and ranks across more than 50 jobs before pagination', async () => {
    cap = 17
    jobs = Array.from({ length: 65 }, (_, n) => ({ ...jobs[0], id: jobId(n + 1), title: `Role ${n + 1}` }))
    seekers = Array.from({ length: 1205 }, (_, n) => ({ id: seekerId(n + 1), first_name: 'Candidate', last_name: String(n + 1) }))
    apps = seekers.map((seeker, n) => ({ id: applicationId(n + 1), seeker_id: seeker.id, job_id: jobId(65), status: ['applied', 'interview', 'hold', 'rejected'][n % 4], applied_at: '2026-10-08T12:00:00Z' }))
    const first = await overview({ sort: 'applications_desc', size: 1 })
    expect(first.jobs[0]).toMatchObject({ id: jobId(65), applicationCount: 1205 })
    expect(first.totalJobs).toBe(65)
    expect(first.summary).toEqual({
      applications: 1205, jobsWithApplications: 1, companiesWithApplications: 1,
      statusCounts: { applied: 302, interview: 301, hold: 301, rejected: 301 },
    })
    expect(first.trend).toEqual([{ date: '2026-10-08', count: 1205 }])
    const later = await overview({ sort: 'applications_desc', page: 2, size: 50 })
    expect(later.jobs.map(job => job.id)).toEqual(Array.from({ length: 15 }, (_, i) => jobId(i + 50)))
    expect(later.summary).toEqual(first.summary)
    const applicants = await details({ job: jobId(65), page: 25, size: 50 })
    expect(applicants!.totalCount).toBe(1205)
    expect(applicants!.applications.map(app => app.id)).toEqual([1201, 1202, 1203, 1204, 1205].map(applicationId))
  }, 15_000)
})

describe('admin job applications direct reads', () => {
  it('returns the selected job and nullable applicant names with explicit database identifiers', async () => {
    const result = await details()
    expect(result!.job).toEqual({ id: jobId(1), title: 'Zulu Chef', status: 'active', company: { id: companyId(1), name: 'Zulu Works' } })
    expect(result!.totalCount).toBe(3)
    expect(result!.applications[0]).toMatchObject({
      id: applicationId(4), status: 'rejected', applicant: { id: seekerId(4), firstName: null, lastName: null },
    })
    expect(Date.parse(result!.applications[0].appliedAt)).toBe(Date.parse('2026-10-09T03:59:59.999Z'))
  })

  it.each([
    ['newest', [4, 3, 2]], ['oldest', [2, 3, 4]], ['name', [4, 3, 2]],
  ] as const)('orders applicant rows by %s before pagination', async (sort, ids) => {
    expect((await details({ sort }))!.applications.map(app => app.id)).toEqual(ids.map(applicationId))
    const page = await details({ sort, page: 2, size: 1 })
    expect(page!.applications.map(app => app.id)).toEqual([applicationId(ids[1])])
    expect(page!.totalCount).toBe(3)
  })

  it.each(['newest', 'oldest', 'name'] as const)('uses ascending ID to break applicant %s ties', async sort => {
    const result = await details({ job: jobId(2), sort })
    expect(result!.applications.map(app => app.id)).toEqual([6, 7].map(applicationId))
  })

  it('combines status and full-name searches without requiring non-null name fields', async () => {
    expect((await details({ search: 'aMy', status: 'hold' }))!.applications.map(app => app.id)).toEqual([applicationId(3)])
    expect((await details({ search: 'zULu', status: 'interview' }))!.applications.map(app => app.id)).toEqual([applicationId(2)])
    expect((await details({ job: jobId(2), search: 'aNN aB', status: 'applied' }))!.totalCount).toBe(2)
    const noMatch = await details({ search: 'Amy', status: 'rejected' })
    expect(noMatch!.totalCount).toBe(0)
    expect(noMatch!.applications).toEqual([])
  })

  it('sorts a missing first name by the visible surname rather than an artificial leading space', async () => {
    seekers[2] = { ...seekers[2], first_name: 'Ada', last_name: 'Brown' }
    const result = await details({ sort: 'name' })
    const named = result!.applications.filter(row => row.applicant.firstName || row.applicant.lastName)
    expect(named.map(row => [row.applicant.firstName, row.applicant.lastName])).toEqual([['Ada', 'Brown'], [null, 'Zulu']])
  })

  it.each(['%', '_', '\\', 'pERCENT%_\\ nAmE'])('treats applicant search %j literally', async search => {
    expect((await details({ job: jobId(3), search }))!.applications.map(app => app.id)).toEqual([applicationId(8)])
    expect((await details({ job: jobId(2), search }))!.applications).toEqual([])
  })

  it('distinguishes absent jobs, empty jobs, and out-of-range pages', async () => {
    expect(await details({ job: jobId(999) })).toBeNull()
    const empty = await details({ job: jobId(5) })
    expect(empty!.job.id).toBe(jobId(5))
    expect(empty!.totalCount).toBe(0)
    expect(empty!.applications).toEqual([])
    const outside = await details({ page: 10_000, size: 50 })
    expect(outside!.job.id).toBe(jobId(1))
    expect(outside!.totalCount).toBe(3)
    expect(outside!.applications).toEqual([])
  })
})

describe('direct-read completeness, privacy, and resource limits', () => {
  it('projects only approved fields and exhausts capped pages through the terminating empty read', async () => {
    const result = await overview()
    const list = await details()
    expect(JSON.stringify([result, list])).not.toMatch(/private-applicant|private\/storage|cover_letter|seeker_id|email|phone/)
    const finalApplicationRead = reads.filter(read => read.url.pathname.endsWith('/applications')).at(-1)!
    expect(finalApplicationRead.url.searchParams.get('id')).toBe(`gt.${applicationId(4)}`)
    expect(finalApplicationRead.url.searchParams.getAll('applied_at')).toEqual(['gte.2026-10-08T04:00:00.000Z', 'lt.2026-10-09T04:00:00.000Z'])
  })

  it('does not scan applications for a missing job or an empty overview search', async () => {
    expect(await details({ job: jobId(999) })).toBeNull()
    expect((await overview({ search: 'does not exist' })).jobs).toEqual([])
    expect(reads.every(read => read.url.pathname.endsWith('/job_listings'))).toBe(true)
  })

  it('includes and globally sorts jobs beyond the backend 1,000-row cap', async () => {
    cap = 500
    jobs = Array.from({ length: 1_205 }, (_, n) => ({ ...jobs[0], id: jobId(n + 1), title: `Role ${n + 1}` }))
    apps = [{ ...apps[2], job_id: jobId(1_205) }]
    const result = await overview({ sort: 'applications_desc', size: 1 })
    expect(result.jobs[0]).toMatchObject({ id: jobId(1_205), applicationCount: 1 })
    expect(result.totalJobs).toBe(1_205)
  })

  it('preserves PostgreSQL microsecond order instead of treating different instants as ID ties', async () => {
    apps[5].applied_at = '2026-10-08T12:00:00.000001Z'
    apps[6].applied_at = '2026-10-08T12:00:00.000002Z'
    expect((await details({ job: jobId(2) }))!.applications.map(row => row.id)).toEqual([7, 6].map(applicationId))
  })

  it.each(['0001-01-01', '0099-12-31', '2024-02-29', '9999-12-31'])('converts exact-year Antigua boundaries for %s', async date => {
    await overview({ start: date, end: date })
    const values = reads.find(read => read.url.pathname.endsWith('/applications'))!.url.searchParams.getAll('applied_at')
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Antigua', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(values[0].slice(4)))
    expect(parts.find(part => part.type === 'year')!.value).toBe(String(Number(date.slice(0, 4))))
    expect(parts.find(part => part.type === 'month')!.value).toBe(date.slice(5, 7))
    expect(parts.find(part => part.type === 'day')!.value).toBe(date.slice(8, 10))
    expect(parts.find(part => part.type === 'hour')!.value).toBe('00')
    expect(Number.isFinite(Date.parse(values[1].slice(3)))).toBe(true)
  })

  it.each(['insert', 'delete', 'status', 'job-title', 'company-name', 'applicant-name'])('rejects observable %s drift between scans rather than inconsistent totals', async mutation => {
    let starts = 0
    beforeRead = read => {
      if (!read.url.pathname.endsWith('/job_listings') || read.url.searchParams.getAll('id').some(value => value.startsWith('gt.'))) return
      if (++starts !== 2) return
      if (mutation === 'insert') apps.push({ ...apps[2], id: applicationId(99) })
      if (mutation === 'delete') apps.splice(2, 1)
      if (mutation === 'status') apps[2].status = 'interview'
      if (mutation === 'job-title') jobs[0].title = 'Changed title'
      if (mutation === 'company-name') companies[0].company_name = 'Changed company'
      if (mutation === 'applicant-name') seekers[2].first_name = 'Changed name'
    }
    await expect(mutation === 'applicant-name' ? details() : overview()).rejects.toThrow('Application read unavailable')
  })

  it.each(['duplicate', 'reverse', 'bad-id', 'bad-date', 'not-array'])('rejects malformed or nonadvancing %s batches', async mode => {
    transform = (rows, read) => {
      if (!read.url.pathname.endsWith('/job_listings')) return rows
      if (mode === 'not-array') return { data: rows }
      if (mode === 'duplicate') return rows.length ? [rows[0], rows[0]] : rows
      if (mode === 'reverse') return [...rows].reverse()
      if (mode === 'bad-id') return rows.map(row => ({ ...row, id: 'invalid' }))
      return rows.map(row => ({ ...row, created_at: 'not a timestamp' }))
    }
    await expect(overview()).rejects.toThrow()
  })

  it('fails closed on the request budget when a small cap needs too many reads', async () => {
    cap = 1
    jobs = Array.from({ length: 81 }, (_, n) => ({ ...jobs[0], id: jobId(n + 1) }))
    await expect(overview({ search: 'no match' })).rejects.toThrow('Application read unavailable')
    expect(reads).toHaveLength(APPLICATION_READ_BUDGET.requests)
  })

  it('shares its row budget across both scans and rejects rather than returning partial counts', async () => {
    cap = 1_000
    jobs = [jobs[0]]
    seekers = [seekers[0]]
    apps = Array.from({ length: 25_001 }, (_, n) => ({ id: applicationId(n + 1), job_id: jobId(1), seeker_id: seekerId(1), status: 'applied', applied_at: '2026-10-08T12:00:00Z' }))
    await expect(overview()).rejects.toThrow('Application read unavailable')
    expect(reads.length).toBeLessThan(APPLICATION_READ_BUDGET.requests)
  })

  it('does not query after caller cancellation and cleans up the deadline timer', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    controller.abort()
    await expect(overview({}, controller.signal)).rejects.toThrow('Application read unavailable')
    expect(reads).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not hide extra requests behind automatic retries on a transient backend failure', async () => {
    const fetch = vi.fn(async () => Response.json({ message: privateDiagnostic }, { status: 503 }))
    const failingClient = createClient('https://synthetic.invalid', 'synthetic-test-key', {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
    })
    await expect(readApplicationOverview(failingClient, overviewDefaults)).rejects.toThrow('Application read unavailable')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each(['caller', 'deadline'])('aborts an in-flight Supabase read on %s cancellation', async reason => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let signal: AbortSignal | undefined
    const pendingClient = createClient('https://synthetic.invalid', 'synthetic-test-key', {
      auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (_input, options) => new Promise((_resolve, reject) => {
        signal = options?.signal as AbortSignal
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }) },
    })
    const pending = expect(readApplicationOverview(pendingClient, overviewDefaults, controller.signal)).rejects.toThrow('Application read unavailable')
    await vi.advanceTimersByTimeAsync(0)
    if (reason === 'caller') controller.abort()
    else await vi.advanceTimersByTimeAsync(APPLICATION_READ_BUDGET.milliseconds)
    await pending
    expect(signal!.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up timer and caller listener after successful reads', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    await overview({}, controller.signal)
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
