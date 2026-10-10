// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), createAdmin: vi.fn(), from: vi.fn(), rpc: vi.fn(), read: vi.fn(),
  overviewRead: vi.fn(), applicantsRead: vi.fn(),
  select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), ilike: vi.fn(),
  insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), delete: vi.fn(), sign: vi.fn(),
}))
vi.mock('@/lib/api-auth', () => ({ requireAdmin: mocks.auth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdmin }))
vi.mock('@/app/api/admin/applications/_reads', () => ({
  readApplicationOverview: mocks.overviewRead,
  readJobApplicants: mocks.applicantsRead,
}))
import { GET as getOverview } from '@/app/api/admin/applications/overview/route'
import { GET as getApplicants } from '@/app/api/admin/applications/jobs/[jobId]/applicants/route'
import { GET as getDetail } from '@/app/api/admin/applications/[applicationId]/route'
import { GET as getFilters } from '@/app/api/admin/applications/filters/route'

const origin = 'https://joblinkantigua.com'
const companyId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const applicationId = '33333333-3333-4333-8333-333333333333'
const profileId = '44444444-4444-4444-8444-444444444444'
const userId = '55555555-5555-4555-8555-555555555555'
const privateEmail = 'private-applicant@example.test'
const privatePhone = '+1-268-555-0199'
const privateCv = 'https://storage.example.test/private/cvs/applicant.pdf?token=private-cv-token'
const privateCoverLetter = 'https://storage.example.test/private/letters/applicant.pdf?token=private-letter-token'
const privateDiagnostic = `private database diagnostic for ${privateEmail}: ${privateCv}`
const scope = { from: '2026-09-01', to: '2026-09-30', timeZone: 'America/Antigua' }
const dateQuery = '?from=2026-09-01&to=2026-09-30'
const storedApplication = {
  id: applicationId, job_id: jobId, seeker_id: profileId, status: 'interview',
  applied_at: '2026-09-16T14:30:00Z', cover_letter_text: 'I would like to join your hospitality team.',
  cover_letter_url: privateCoverLetter,
  job_listings: {
    id: jobId, title: 'Guest Services Associate',
    companies: { id: companyId, company_name: 'Harbour Hotel', contact_email: 'private-employer@example.test' },
  },
  seeker_profiles: {
    id: profileId, user_id: userId, first_name: 'Ada', last_name: 'James',
    phone: privatePhone, location: 'St. John’s', cv_url: privateCv,
  },
}
const listedJob = {
  id: jobId, title: 'Guest Services Associate', status: 'active',
  company: { id: companyId, name: 'Harbour Hotel' },
}
const overviewPayload = {
  totalJobs: 7,
  summary: {
    applications: 10, jobsWithApplications: 3, companiesWithApplications: 2,
    statusCounts: { applied: 4, interview: 3, hold: 2, rejected: 1 },
  },
  jobs: [{ ...listedJob, createdAt: '2026-09-01T12:00:00Z', applicationCount: 5, latestApplicationAt: '2026-09-16T14:30:00Z' }],
  trend: [{ date: '2026-09-16', count: 5 }],
}
const applicantsPayload = {
  job: listedJob, totalCount: 4,
  applications: [{
    id: applicationId, appliedAt: '2026-09-16T14:30:00Z', status: 'interview',
    applicant: { id: profileId, firstName: 'Ada', lastName: 'James' },
  }],
}

type DatabaseResult = { data: unknown; error: { message: string } | null; count?: number }
const tableResults = new Map<string, DatabaseResult>()

function queryFor(table: string) {
  const query = {
    select: (...args: unknown[]) => { mocks.select(table, ...args); return query },
    eq: (...args: unknown[]) => { mocks.eq(table, ...args); return query },
    order: (...args: unknown[]) => { mocks.order(table, ...args); return query },
    range: (...args: unknown[]) => { mocks.range(table, ...args); return query },
    ilike: (...args: unknown[]) => { mocks.ilike(table, ...args); return query },
    limit: () => query,
    in: () => query,
    is: () => query,
    not: () => query,
    insert: (...args: unknown[]) => { mocks.insert(table, ...args); return query },
    update: (...args: unknown[]) => { mocks.update(table, ...args); return query },
    upsert: (...args: unknown[]) => { mocks.upsert(table, ...args); return query },
    delete: (...args: unknown[]) => { mocks.delete(table, ...args); return query },
    single: () => mocks.read(table),
    maybeSingle: () => mocks.read(table),
    then: (resolve: (value: DatabaseResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(mocks.read(table)).then(resolve, reject),
  }
  return query
}

async function privateResponse(response: Promise<Response>) {
  const result = await response
  expect(result.headers.get('Cache-Control')).toBe('private, no-store')
  return result
}
const sendOverview = (query = '') => privateResponse(getOverview(new NextRequest(`${origin}/api/admin/applications/overview${query}`)))
const sendApplicants = (query = '', id = jobId) => privateResponse(getApplicants(
  new NextRequest(`${origin}/api/admin/applications/jobs/${id}/applicants${query}`), { params: Promise.resolve({ jobId: id }) },
))
const sendDetail = (query = '', id = applicationId) => privateResponse(getDetail(
  new NextRequest(`${origin}/api/admin/applications/${id}${query}`), { params: Promise.resolve({ applicationId: id }) },
))
const sendFilters = (query = '') => privateResponse(getFilters(new NextRequest(`${origin}/api/admin/applications/filters${query}`)))
const endpoints = [
  { name: 'overview', send: sendOverview },
  { name: 'applicants', send: sendApplicants },
  { name: 'detail', send: sendDetail },
  { name: 'filters', send: sendFilters },
]

function expectNoDataAccess() {
  expect(mocks.createAdmin).not.toHaveBeenCalled()
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.read).not.toHaveBeenCalled()
  expect(mocks.overviewRead).not.toHaveBeenCalled()
  expect(mocks.applicantsRead).not.toHaveBeenCalled()
  expect(mocks.sign).not.toHaveBeenCalled()
}

async function expectGenericFailure(response: Response) {
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'Unable to load application data. Please try again.' })
}

beforeEach(() => {
  vi.resetAllMocks()
  tableResults.clear()
  tableResults.set('applications', { data: storedApplication, error: null })
  tableResults.set('users', { data: { email: privateEmail }, error: null })
  tableResults.set('cv_profiles', { data: { id: '66666666-6666-4666-8666-666666666666' }, error: null })
  tableResults.set('companies', { data: [{ id: companyId, company_name: 'Harbour Hotel', contact_email: privateEmail }], error: null, count: 7 })
  tableResults.set('job_listings', { data: [{ id: jobId, title: 'Guest Services Associate', company_id: companyId, contact_email: privateEmail }], error: null, count: 4 })
  mocks.auth.mockResolvedValue({ user: { id: 'admin-user' }, isAdmin: true })
  mocks.overviewRead.mockResolvedValue({ ...overviewPayload, scope, page: 1, limit: 20 })
  mocks.applicantsRead.mockResolvedValue({ ...applicantsPayload, scope, page: 1, limit: 20 })
  mocks.read.mockImplementation(async (table: string) => tableResults.get(table) ?? { data: null, error: null })
  mocks.from.mockImplementation(queryFor)
  mocks.createAdmin.mockReturnValue({
    from: mocks.from, rpc: mocks.rpc,
    storage: { from: () => ({ createSignedUrl: mocks.sign }) },
  })
  for (const method of ['error', 'warn', 'log'] as const) vi.spyOn(console, method).mockImplementation(() => {})
})

afterEach(() => {
  for (const mutation of [mocks.insert, mocks.update, mocks.upsert, mocks.delete]) expect(mutation).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.sign).not.toHaveBeenCalled()
  const logged = [console.error, console.warn, console.log].flatMap(method => vi.mocked(method).mock.calls)
    .flatMap(args => args.map(value => value instanceof Error ? value.stack ?? value.message : JSON.stringify(value))).join('\n')
  for (const secret of [privateEmail, privatePhone, privateCv, privateCoverLetter, 'private database diagnostic']) {
    expect(logged).not.toContain(secret)
  }
  vi.restoreAllMocks()
})

describe.each(endpoints)('admin applications $name boundary', ({ send }) => {
  it.each([401, 403])('returns %s before validating inputs or creating a service client', async status => {
    mocks.auth.mockResolvedValue({ error: NextResponse.json({ error: 'Not allowed' }, { status }) })
    const response = await send('?page=invalid&applicantPage=invalid&companyId=invalid', 'invalid-id')
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: 'Not allowed' })
    expect(mocks.auth).toHaveBeenCalledOnce()
    expectNoDataAccess()
  })

  it('handles authentication exceptions without accessing or exposing private data', async () => {
    mocks.auth.mockRejectedValue(new Error(privateDiagnostic))
    await expectGenericFailure(await send())
    expectNoDataAccess()
  })

  it('handles service-client creation exceptions with a private generic failure', async () => {
    mocks.createAdmin.mockImplementation(() => { throw new Error(privateDiagnostic) })
    await expectGenericFailure(await send())
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.overviewRead).not.toHaveBeenCalled()
    expect(mocks.applicantsRead).not.toHaveBeenCalled()
  })

  it('handles database errors without returning or logging private diagnostics', async () => {
    const failure = { data: null, error: { message: privateDiagnostic } }
    mocks.overviewRead.mockRejectedValue(failure.error)
    mocks.applicantsRead.mockRejectedValue(failure.error)
    mocks.read.mockResolvedValue(failure)
    await expectGenericFailure(await send())
  })

  it('handles thrown database failures without returning or logging private diagnostics', async () => {
    mocks.overviewRead.mockRejectedValue(new Error(privateDiagnostic))
    mocks.applicantsRead.mockRejectedValue(new Error(privateDiagnostic))
    mocks.read.mockRejectedValue(new Error(privateDiagnostic))
    await expectGenericFailure(await send())
  })
})

describe('admin applications validation', () => {
  it.each([
    '?page=0', '?page=1.5', '?page=10001', '?page=1%0A', '?limit=51', '?limit=-1', '?page=1&page=2',
    '?companyId=not-a-uuid', `?companyId=${companyId}%0A`, '?jobId=not-a-uuid', `?jobId=${jobId}%0A`,
    '?status=hired', '?jobStatus=archived', '?sort=email',
    '?from=2026-09-01', '?from=2026-02-30&to=2026-03-01', '?from=2026-10-01&to=2026-09-01',
    '?from=2025-01-01&to=2026-01-02', `?q=${'a'.repeat(161)}`,
  ])('rejects malformed overview filters %s before service-client creation', async query => {
    expect((await sendOverview(query)).status).toBe(400)
    expect(mocks.auth).toHaveBeenCalledOnce()
    expectNoDataAccess()
  })

  it.each([
    '?applicantPage=0', '?applicantPage=1.5', '?applicantPage=10001', '?applicantPage=1%0A', '?applicantLimit=51',
    '?applicantPage=1&applicantPage=2', '?status=hired', '?applicantSort=email',
    '?to=2026-09-01', '?from=2026-02-30&to=2026-03-01', `?applicantQ=${'a'.repeat(161)}`,
  ])('rejects malformed applicant filters %s before service-client creation', async query => {
    expect((await sendApplicants(query)).status).toBe(400)
    expect(mocks.auth).toHaveBeenCalledOnce()
    expectNoDataAccess()
  })

  it.each([
    '?kind=applicant', '?kind=job&kind=company', '?companyId=not-a-uuid', '?page=0',
    '?limit=51', '?limit=1%0A', `?q=${'a'.repeat(161)}`,
  ])('rejects malformed filter-option requests %s before service-client creation', async query => {
    expect((await sendFilters(query)).status).toBe(400)
    expect(mocks.auth).toHaveBeenCalledOnce()
    expectNoDataAccess()
  })

  it.each(['not-a-uuid', `${jobId}/other`, `${jobId}'`, `${jobId}\n`, `${jobId}\r\n`, ''])('rejects invalid job UUID %j after authorization', async id => {
    expect((await sendApplicants('', id)).status).toBe(400)
    expect(mocks.auth).toHaveBeenCalledOnce()
    expectNoDataAccess()
  })

  it.each(['not-a-uuid', `${applicationId}/other`, `${applicationId}'`, `${applicationId}\n`, `${applicationId}\r\n`, ''])('rejects invalid application UUID %j after authorization', async id => {
    expect((await sendDetail('', id)).status).toBe(400)
    expect(mocks.auth).toHaveBeenCalledOnce()
    expectNoDataAccess()
  })
})

describe('admin application detail', () => {
  it('returns selected applicant contacts and protected current-resume links without storage URLs', async () => {
    const response = await sendDetail()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ application: {
      id: applicationId, jobId, appliedAt: storedApplication.applied_at, status: 'interview',
      coverLetterText: storedApplication.cover_letter_text,
      job: { id: jobId, title: 'Guest Services Associate', company: { id: companyId, name: 'Harbour Hotel' } },
      applicant: {
        id: profileId, userId, firstName: 'Ada', lastName: 'James', email: privateEmail,
        phone: privatePhone, location: 'St. John’s',
      },
      resume: {
        label: 'Current résumé', uploadedHref: `/api/cv-download?profileId=${profileId}`,
        builtHref: `/api/cv/export?userId=${userId}`,
      },
      notificationTracking: 'not_tracked',
    } })
    const serialized = JSON.stringify(body)
    for (const excluded of [privateCv, privateCoverLetter, 'cv_url', 'cover_letter_url', 'private-employer@example.test']) {
      expect(serialized).not.toContain(excluded)
    }
    expect(mocks.eq).toHaveBeenCalledWith('applications', 'id', applicationId)
    expect(mocks.eq).toHaveBeenCalledWith('users', 'id', userId)
    expect(mocks.eq).toHaveBeenCalledWith('cv_profiles', 'user_id', userId)
    const applicationSelection = mocks.select.mock.calls.find(([table]) => table === 'applications')?.[1]
    expect(applicationSelection).not.toContain('cover_letter_url')
    expect(applicationSelection).not.toContain('*')
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.createAdmin.mock.invocationCallOrder[0])
  })

  it('returns 404 for a missing application without reading applicant contacts', async () => {
    tableResults.set('applications', { data: null, error: null })
    expect((await sendDetail()).status).toBe(404)
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.from).toHaveBeenCalledWith('applications')
  })

  it('keeps a historical application readable when the applicant or job is unavailable', async () => {
    tableResults.set('applications', {
      data: { ...storedApplication, seeker_profiles: null, job_listings: null }, error: null,
    })
    const response = await sendDetail()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ application: {
      id: applicationId, job: null, applicant: null,
      resume: { label: 'Current résumé', uploadedHref: null, builtHref: null },
    } })
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it('returns null resume links when neither an upload nor a built resume exists', async () => {
    tableResults.set('applications', {
      data: { ...storedApplication, seeker_profiles: { ...storedApplication.seeker_profiles, cv_url: null } }, error: null,
    })
    tableResults.set('cv_profiles', { data: null, error: null })
    const response = await sendDetail()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ application: {
      resume: { label: 'Current résumé', uploadedHref: null, builtHref: null },
    } })
  })

  it('distinguishes an uploaded resume from a missing built resume', async () => {
    tableResults.set('cv_profiles', { data: null, error: null })
    const response = await sendDetail()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ application: {
      resume: { uploadedHref: `/api/cv-download?profileId=${profileId}`, builtHref: null },
    } })
  })

  it('allows unavailable contact and company records without inventing their details', async () => {
    tableResults.set('applications', {
      data: { ...storedApplication, job_listings: { ...storedApplication.job_listings, companies: null } }, error: null,
    })
    tableResults.set('users', { data: null, error: null })
    const response = await sendDetail()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ application: {
      job: { id: jobId, company: null }, applicant: { email: null },
    } })
  })

  it.each(['users', 'cv_profiles'])('does not return partial private data when the %s lookup fails', async table => {
    tableResults.set(table, { data: null, error: { message: privateDiagnostic } })
    await expectGenericFailure(await sendDetail())
  })

  it('supports array-shaped database relations without exposing the underlying records', async () => {
    tableResults.set('applications', { data: {
      ...storedApplication,
      job_listings: [{ ...storedApplication.job_listings, companies: [storedApplication.job_listings.companies] }],
      seeker_profiles: [storedApplication.seeker_profiles],
    }, error: null })
    const response = await sendDetail()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ application: {
      job: { id: jobId, company: { id: companyId, name: 'Harbour Hotel' } },
      applicant: { id: profileId, userId },
    } })
  })

  it('rejects malformed applicant IDs before constructing resume URLs or reading contacts', async () => {
    tableResults.set('applications', { data: {
      ...storedApplication, seeker_profiles: { ...storedApplication.seeker_profiles, user_id: '../another-user' },
    }, error: null })
    await expectGenericFailure(await sendDetail())
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
})

describe('admin application overview', () => {
  it('passes normalized filters to the read helper and returns its complete overview', async () => {
    const overview = { ...overviewPayload, scope, page: 2, limit: 5 }
    mocks.overviewRead.mockResolvedValue(overview)
    const response = await sendOverview(`${dateQuery}&q=%20Guest%20&companyId=${companyId}&jobId=${jobId}&status=interview&jobStatus=active&sort=applications_desc&page=2&limit=5`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(overview)
    expect(mocks.overviewRead).toHaveBeenCalledExactlyOnceWith(mocks.createAdmin.mock.results[0].value, {
      from: scope.from, to: scope.to, q: 'Guest', companyId, jobId,
      status: 'interview', jobStatus: 'active', sort: 'applications_desc', page: 2, limit: 5,
    }, expect.any(AbortSignal))
    expect(mocks.applicantsRead).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.createAdmin.mock.invocationCallOrder[0])
    expect(mocks.createAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.overviewRead.mock.invocationCallOrder[0])
  })

  it('returns real zero counts and an empty result page', async () => {
    const empty = {
      scope, page: 1, limit: 20, totalJobs: 0, jobs: [], trend: [],
      summary: { applications: 0, jobsWithApplications: 0, companiesWithApplications: 0, statusCounts: { applied: 0, interview: 0, hold: 0, rejected: 0 } },
    }
    mocks.overviewRead.mockResolvedValue(empty)
    const response = await sendOverview(dateQuery)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(empty)
    expect(mocks.overviewRead).toHaveBeenCalledWith(expect.anything(), {
      from: scope.from, to: scope.to, q: '', companyId: null, jobId: null,
      status: 'all', jobStatus: 'all', sort: 'latest', page: 1, limit: 20,
    }, expect.any(AbortSignal))
  })

  it('forwards request cancellation to the overview read helper', async () => {
    const controller = new AbortController()
    const request = new NextRequest(`${origin}/api/admin/applications/overview${dateQuery}`, { signal: controller.signal })
    const response = await privateResponse(getOverview(request))
    expect(response.status).toBe(200)
    const signal = mocks.overviewRead.mock.calls[0][2] as AbortSignal
    expect(signal).toBe(request.signal)
    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
  })
})

describe('admin job applicants', () => {
  it('passes the job and normalized applicant filters to the read helper', async () => {
    const applicants = { ...applicantsPayload, scope, page: 2, limit: 5 }
    mocks.applicantsRead.mockResolvedValue(applicants)
    const response = await sendApplicants(`${dateQuery}&status=interview&applicantQ=%20Ada%20&applicantSort=name&applicantPage=2&applicantLimit=5`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(applicants)
    expect(mocks.applicantsRead).toHaveBeenCalledExactlyOnceWith(mocks.createAdmin.mock.results[0].value, jobId, {
      from: scope.from, to: scope.to, status: 'interview',
      applicantQ: 'Ada', applicantSort: 'name', applicantPage: 2, applicantLimit: 5,
    }, expect.any(AbortSignal))
    expect(mocks.overviewRead).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.createAdmin.mock.invocationCallOrder[0])
    expect(mocks.createAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.applicantsRead.mock.invocationCallOrder[0])
  })

  it.each(['applied', 'interview', 'hold', 'rejected'])('preserves the %s workflow status without changing applications', async status => {
    const payload = { ...applicantsPayload, scope, page: 1, limit: 20, applications: [{ ...applicantsPayload.applications[0], status }] }
    mocks.applicantsRead.mockResolvedValue(payload)
    const response = await sendApplicants(`${dateQuery}&status=${status}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(payload)
    expect(mocks.applicantsRead).toHaveBeenCalledWith(expect.anything(), jobId, expect.objectContaining({ status }), expect.any(AbortSignal))
  })

  it('returns 404 when the read helper reports a missing job', async () => {
    mocks.applicantsRead.mockResolvedValue(null)
    expect((await sendApplicants(dateQuery)).status).toBe(404)
    expect(mocks.applicantsRead).toHaveBeenCalledOnce()
  })

  it('distinguishes an existing job with no applicants from a missing job', async () => {
    const empty = { job: listedJob, totalCount: 0, applications: [], scope, page: 1, limit: 20 }
    mocks.applicantsRead.mockResolvedValue(empty)
    const response = await sendApplicants(dateQuery)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(empty)
    expect(mocks.applicantsRead).toHaveBeenCalledWith(expect.anything(), jobId, {
      from: scope.from, to: scope.to, status: 'all',
      applicantQ: '', applicantSort: 'newest', applicantPage: 1, applicantLimit: 20,
    }, expect.any(AbortSignal))
  })

  it('forwards request cancellation to the applicant read helper', async () => {
    const controller = new AbortController()
    const request = new NextRequest(`${origin}/api/admin/applications/jobs/${jobId}/applicants${dateQuery}`, { signal: controller.signal })
    const response = await privateResponse(getApplicants(request, { params: Promise.resolve({ jobId }) }))
    expect(response.status).toBe(200)
    const signal = mocks.applicantsRead.mock.calls[0][3] as AbortSignal
    expect(signal).toBe(request.signal)
    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
  })
})

describe('admin application filter options', () => {
  it('returns only bounded company identifiers and names', async () => {
    const response = await sendFilters('?kind=company&page=2&limit=2')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [{ id: companyId, name: 'Harbour Hotel' }], page: 2, limit: 2, totalCount: 7 })
    expect(mocks.select).toHaveBeenCalledWith('companies', 'id,company_name', { count: 'exact' })
    expect(mocks.range).toHaveBeenCalledWith('companies', 2, 3)
    expect(mocks.order).toHaveBeenCalledWith('companies', 'company_name', { ascending: true })
    expect(mocks.order).toHaveBeenCalledWith('companies', 'id', { ascending: true })
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(mocks.createAdmin.mock.invocationCallOrder[0])
  })

  it('returns only job identifiers and titles within the requested company', async () => {
    const response = await sendFilters(`?kind=job&companyId=${companyId}&page=2&limit=3`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [{ id: jobId, name: 'Guest Services Associate' }], page: 2, limit: 3, totalCount: 4 })
    expect(mocks.select).toHaveBeenCalledWith('job_listings', 'id,title', { count: 'exact' })
    expect(mocks.eq).toHaveBeenCalledWith('job_listings', 'company_id', companyId)
    expect(mocks.range).toHaveBeenCalledWith('job_listings', 3, 5)
    expect(mocks.order).toHaveBeenCalledWith('job_listings', 'title', { ascending: true })
    expect(mocks.order).toHaveBeenCalledWith('job_listings', 'id', { ascending: true })
  })

  it('treats search wildcard characters as literal input', async () => {
    const response = await sendFilters('?kind=company&q=harbour_50%25')
    expect(response.status).toBe(200)
    expect(mocks.ilike).toHaveBeenCalledWith('companies', 'company_name', '%harbour\\_50\\%%')
  })

  it('returns an empty page without inventing filter options', async () => {
    tableResults.set('companies', { data: [], error: null, count: 0 })
    const response = await sendFilters()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [], page: 1, limit: 20, totalCount: 0 })
  })

  it.each([undefined, null, -1, 1.5, '7'])('refuses missing or invalid counts %j instead of fabricating totals', async count => {
    tableResults.set('companies', { data: [], error: null, count } as DatabaseResult)
    await expectGenericFailure(await sendFilters())
  })
})
