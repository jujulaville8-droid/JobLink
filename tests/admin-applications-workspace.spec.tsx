import { useSyncExternalStore, type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationsWorkspace from '@/components/admin-applications/ApplicationsWorkspace'
import type { ApplicationDetail, ApplicationOverview, JobApplicants } from '@/lib/admin-applications'

const navigation = vi.hoisted(() => ({
  url: '/admin/applications', listeners: new Set<() => void>(), push: vi.fn(), replace: vi.fn(),
}))
const session = vi.hoisted(() => ({
  value: { user: { id: 'synthetic-admin-one' } as { id: string } | null, isLoading: false, isAdminUser: false },
  listeners: new Set<() => void>(),
}))
function sessionSubscribe(listener: () => void) { session.listeners.add(listener); return () => { session.listeners.delete(listener) } }
function sessionSnapshot() { return session.value }
function changeSession(values: Partial<typeof session.value>) {
  session.value = { ...session.value, ...values }
  session.listeners.forEach(listener => listener())
}
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => useSyncExternalStore(sessionSubscribe, sessionSnapshot),
}))
function commit(url: string) {
  navigation.url = url
  navigation.listeners.forEach(listener => listener())
}
function subscribe(listener: () => void) { navigation.listeners.add(listener); return () => { navigation.listeners.delete(listener) } }
function snapshot() { return navigation.url }
vi.mock('next/navigation', () => ({
  usePathname: () => new URL(useSyncExternalStore(subscribe, snapshot), 'https://joblink.invalid').pathname,
  useSearchParams: () => new URL(useSyncExternalStore(subscribe, snapshot), 'https://joblink.invalid').searchParams,
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...props }: ComponentProps<'a'>) => <a {...props} href={href} onClick={event => {
    onClick?.(event)
    event.preventDefault()
    if (href) navigation.push(href, { scroll: false })
  }}>{children}</a>,
}))
const jobId = '33333333-3333-4333-8333-333333333333'
const companyId = '77777777-7777-4777-8777-777777777777'
const applicationId = '11111111-1111-4111-8111-111111111111'
const profileId = '55555555-5555-4555-8555-555555555555'
const dates = { from: '2026-09-09', to: '2026-10-08' }
const scope = { ...dates, timeZone: 'America/Antigua' as const }
const job = { id: jobId, title: 'Guest Services Associate', status: 'active', company: { id: companyId, name: 'Harbour Hotel' } }
const overview: ApplicationOverview = {
  scope, page: 1, limit: 20, totalJobs: 83,
  summary: { applications: 6, jobsWithApplications: 1, companiesWithApplications: 1, statusCounts: { applied: 4, interview: 2, hold: 0, rejected: 0 } },
  jobs: [{ ...job, createdAt: '2026-09-01T12:00:00Z', applicationCount: 6, latestApplicationAt: '2026-10-03T14:30:00Z' }],
  trend: [{ date: '2026-10-03', count: 6 }],
}
const applicants: JobApplicants = {
  scope, page: 1, limit: 20, job, totalCount: 22,
  applications: [{ id: applicationId, appliedAt: '2026-10-03T14:30:00Z', status: 'interview', applicant: { id: profileId, firstName: 'Ada', lastName: 'James' } }],
}
const detail: ApplicationDetail = {
  id: applicationId, jobId, appliedAt: applicants.applications[0].appliedAt, status: 'interview',
  coverLetterText: 'Private cover letter for this application.', job,
  applicant: { id: profileId, userId: '66666666-6666-4666-8666-666666666666', firstName: 'Ada', lastName: 'James', email: 'ada@example.test', phone: '+1-268-555-0199', location: 'St. John’s' },
  resume: { label: 'Current résumé', uploadedHref: `/api/cv-download?profileId=${profileId}`, builtHref: null }, notificationTracking: 'not_tracked',
}
const fetchMock = vi.fn<typeof fetch>()
const overviewParams = {
  ...dates, q: 'harbour', companyId, jobId, status: 'interview', jobStatus: 'active', sort: 'applications_desc', page: '3', limit: '20',
}
function url(path: string, params: Record<string, string>) { return `${path}?${new URLSearchParams(params)}` }
function currentParams() { return Object.fromEntries(new URL(navigation.url, 'https://joblink.invalid').searchParams) }
function requestUrl(index = fetchMock.mock.calls.length - 1) { return new URL(String(fetchMock.mock.calls[index][0]), 'https://joblink.invalid') }
function fixtureResponse(input: RequestInfo | URL) {
  const target = new URL(String(input), 'https://joblink.invalid')
  const params = target.searchParams
  const responseScope = { from: params.get('from') ?? dates.from, to: params.get('to') ?? dates.to, timeZone: scope.timeZone }
  if (target.pathname.endsWith('/overview')) return Response.json({ ...overview, scope: responseScope, page: Number(params.get('page') ?? 1), limit: Number(params.get('limit') ?? 20) })
  if (target.pathname.endsWith('/applicants')) return Response.json({ ...applicants, scope: responseScope, page: Number(params.get('applicantPage') ?? 1), limit: Number(params.get('applicantLimit') ?? 20) })
  if (target.pathname === `/api/admin/applications/${applicationId}`) return Response.json({ application: detail })
  throw new Error(`Unexpected synthetic request: ${target.pathname}`)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}
function RoutedWorkspace() {
  const pathname = new URL(useSyncExternalStore(subscribe, snapshot), 'https://joblink.invalid').pathname
  const selectedJob = pathname.split('/')[3]
  return <ApplicationsWorkspace key={selectedJob ?? 'overview'} jobId={selectedJob} initialDates={dates} />
}
function open(path: string = '/admin/applications', params: Record<string, string> = {}) {
  navigation.url = url(path, params)
  return render(<RoutedWorkspace />)
}

beforeEach(() => {
  session.value = { user: { id: 'synthetic-admin-one' }, isLoading: false, isAdminUser: false }
  navigation.url = '/admin/applications'
  navigation.push.mockReset().mockImplementation(commit)
  navigation.replace.mockReset().mockImplementation(commit)
  fetchMock.mockReset().mockImplementation(async input => fixtureResponse(input))
  vi.stubGlobal('fetch', fetchMock)
  // Happy DOM needs modal visibility stubs; browser tests verify native focus containment.
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false })
})
afterEach(() => {
  cleanup()
  for (const [input, options] of fetchMock.mock.calls) {
    expect(String(input)).toMatch(/^\/api\/admin\/applications\//)
    expect(options?.method ?? 'GET').toBe('GET')
    expect(options?.body).toBeUndefined()
    expect(options?.cache).toBe('no-store')
    expect(options?.credentials ?? 'same-origin').toBe('same-origin')
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Applications workspace URL state', () => {
  it('carries overview filters and page through job links, applicant search/sort, and the return link', async () => {
    const user = userEvent.setup()
    open('/admin/applications', overviewParams)
    const jobLink = await screen.findByRole('link', { name: job.title })
    expect(Object.fromEntries(new URL(jobLink.getAttribute('href')!, 'https://joblink.invalid').searchParams)).toEqual(overviewParams)
    await user.click(jobLink)
    await screen.findByRole('button', { name: 'View application from Ada James' })
    expect(screen.getByRole('searchbox', { name: 'Search applicants' }).getAttribute('value')).toBe('')
    expect(requestUrl().searchParams.has('q')).toBe(false)
    await user.click(within(screen.getByRole('navigation', { name: 'Applicants pagination' })).getByRole('button', { name: 'Next page' }))
    expect(currentParams()).toEqual({ ...overviewParams, applicantPage: '2' })
    await user.type(screen.getByRole('searchbox', { name: 'Search applicants' }), '  Ada  ')
    await user.click(screen.getByRole('button', { name: 'Apply search' }))
    await waitFor(() => expect(currentParams()).toEqual({ ...overviewParams, applicantQ: 'Ada' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort applicants' }), 'name')
    await waitFor(() => expect(currentParams()).toEqual({ ...overviewParams, applicantQ: 'Ada', applicantSort: 'name' }))
    const back = screen.getByRole('link', { name: 'Back to applications' })
    expect(Object.fromEntries(new URL(back.getAttribute('href')!, 'https://joblink.invalid').searchParams)).toEqual(overviewParams)
    await user.click(back)
    await screen.findByRole('link', { name: job.title })
    expect(screen.getByRole('searchbox', { name: 'Search jobs or companies' }).getAttribute('value')).toBe('harbour')
    expect(requestUrl().searchParams.get('page')).toBe('3')
  })

  it('resets only the applicant view while keeping the overview context available on return', async () => {
    const user = userEvent.setup()
    open(`/admin/applications/${jobId}`, { ...overviewParams, from: '2026-09-01', to: '2026-09-07', applicantQ: 'Ada', applicantSort: 'name', applicantPage: '2', applicantLimit: '10', application: applicationId })
    await screen.findByRole('button', { name: 'View application from Ada James' })
    await user.click(screen.getByRole('button', { name: 'Reset filters' }))
    const preserved: Record<string, string> = { ...overviewParams }
    delete preserved.status
    expect(currentParams()).toEqual(preserved)
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.any(String), { scroll: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Current application status' })).toHaveProperty('value', 'all')
  })

  it('resets overview pagination when overview search changes and trims the search', async () => {
    const user = userEvent.setup()
    open('/admin/applications', overviewParams)
    await screen.findByRole('link', { name: job.title })
    const search = screen.getByRole('searchbox', { name: 'Search jobs or companies' })
    await user.clear(search)
    await user.type(search, '  reception  ')
    await user.click(screen.getByRole('button', { name: 'Apply search' }))
    const preserved: Record<string, string> = { ...overviewParams }
    delete preserved.page
    expect(currentParams()).toEqual({ ...preserved, q: 'reception' })
    await waitFor(() => expect(requestUrl().searchParams.get('page')).toBe('1'))
  })

  it('uses the provided Antigua date scope and preserves other filters through presets and custom dates', async () => {
    const user = userEvent.setup()
    open('/admin/applications', { q: 'harbour', page: '3' })
    await screen.findByRole('link', { name: job.title })
    expect(requestUrl().searchParams.get('from')).toBe(dates.from)
    expect(requestUrl().searchParams.get('to')).toBe(dates.to)
    expect(screen.getByRole('combobox', { name: /Application dates/ })).toHaveProperty('value', '30')
    await user.selectOptions(screen.getByRole('combobox', { name: /Application dates/ }), '7')
    expect(currentParams()).toEqual({ q: 'harbour', from: '2026-10-02', to: '2026-10-08' })
    await user.selectOptions(screen.getByRole('combobox', { name: /Application dates/ }), 'custom')
    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    fireEvent.change(from, { target: { value: '2026-09-01' } })
    fireEvent.change(to, { target: { value: '2026-09-14' } })
    await user.click(screen.getByRole('button', { name: 'Apply dates' }))
    expect(currentParams()).toEqual({ q: 'harbour', from: '2026-09-01', to: '2026-09-14' })
    await waitFor(() => expect(requestUrl().searchParams.get('from')).toBe('2026-09-01'))
    expect(screen.getByRole('combobox', { name: /Application dates/ })).toHaveProperty('value', 'custom')
    expect(screen.getByText(/Submitted 1 Sept 2026 – 14 Sept 2026 · Antigua time/)).toBeTruthy()
  })

  it('stops an invalid date query before any data read and offers a working reset', async () => {
    const user = userEvent.setup()
    open('/admin/applications', { from: '2026-10-08' })
    expect(screen.getByRole('alert').textContent).toContain('Provide both start and end dates.')
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Reset filters' }))
    await screen.findByRole('link', { name: job.title })
    expect(currentParams()).toEqual(dates)
  })

  it('opens and closes the selection query without refetching or replacing the applicant listing', async () => {
    const user = userEvent.setup()
    const initial = { ...overviewParams, applicantQ: 'Ada', applicantSort: 'oldest', applicantPage: '2', applicantLimit: '10' }
    open(`/admin/applications/${jobId}`, initial)
    const opener = await screen.findByRole('button', { name: 'View application from Ada James' })
    expect(fetchMock).toHaveBeenCalledOnce()
    await user.click(opener)
    expect(currentParams()).toEqual({ ...initial, application: applicationId })
    expect(screen.getByRole('dialog', { name: 'Application details' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View application from Ada James' })).toBe(opener)
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/applicants?'))).toHaveLength(1)
    expect(await screen.findByText('ada@example.test')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Close application details' }))
    expect(currentParams()).toEqual(initial)
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.any(String), { scroll: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'View application from Ada James' })).toBe(opener)
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/applicants?'))).toHaveLength(1)
  })
})

describe('Applications workspace private reads', () => {
  it.each(['success', 'failure'])('clears old rows immediately and ignores an aborted %s that arrives after the newer query', async outcome => {
    const user = userEvent.setup()
    open()
    await screen.findByRole('link', { name: job.title })
    const older = deferred<Response>()
    const newer = deferred<Response>()
    fetchMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const search = screen.getByRole('searchbox', { name: 'Search jobs or companies' })
    await user.type(search, 'old search')
    await user.click(screen.getByRole('button', { name: 'Apply search' }))
    expect(screen.queryByRole('link', { name: job.title })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Loading applications')
    const oldSignal = fetchMock.mock.calls[1][1]!.signal!
    const nextSearch = screen.getByRole('searchbox', { name: 'Search jobs or companies' })
    await user.clear(nextSearch)
    await user.type(nextSearch, 'new search')
    await user.click(screen.getByRole('button', { name: 'Apply search' }))
    expect(oldSignal.aborted).toBe(true)
    await act(async () => newer.resolve(Response.json({ ...overview, jobs: [{ ...overview.jobs[0], title: 'Newest result' }] })))
    await screen.findByRole('link', { name: 'Newest result' })
    await act(async () => {
      if (outcome === 'success') older.resolve(Response.json({ ...overview, jobs: [{ ...overview.jobs[0], title: 'Stale private result' }] }))
      else older.reject(new Error('Stale private failure'))
    })
    expect(screen.getByRole('link', { name: 'Newest result' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Stale private result' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['http', 'network', 'invalid-json'])('shows a generic %s failure and recovers on retry without changing filters', async failure => {
    const user = userEvent.setup()
    const diagnostic = 'private-applicant@example.test / server diagnostic'
    if (failure === 'http') fetchMock.mockResolvedValueOnce(Response.json({ error: diagnostic }, { status: 503 }))
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error(diagnostic))
    if (failure === 'invalid-json') fetchMock.mockResolvedValueOnce(new Response(diagnostic, { status: 200 }))
    open('/admin/applications', overviewParams)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Unable to load applications. Please try again.')
    expect(alert.textContent).not.toContain('private-applicant')
    expect(alert.textContent).not.toContain('server diagnostic')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: job.title })
    expect(currentParams()).toEqual(overviewParams)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0])
  })

  it.each([
    { kind: 'jobs', path: '/admin/applications', pageKey: 'page', heading: 'No jobs on this page' },
    { kind: 'applicants', path: `/admin/applications/${jobId}`, pageKey: 'applicantPage', heading: 'No applicants on this page' },
  ])('recovers an out-of-range $kind page without losing its filters', async ({ kind, path, pageKey, heading }) => {
    const user = userEvent.setup()
    const initial = { ...overviewParams, [pageKey]: '9' }
    fetchMock.mockResolvedValueOnce(Response.json(kind === 'jobs'
      ? { ...overview, page: 9, limit: 20, totalJobs: 3, jobs: [] }
      : { ...applicants, page: 9, limit: 20, totalCount: 3, applications: [] }))
    open(path, initial)
    await screen.findByRole('heading', { name: heading })
    const pagination = screen.getByRole('navigation', { name: kind === 'jobs' ? 'Jobs pagination' : 'Applicants pagination' })
    expect(pagination.textContent).not.toContain('161–3')
    expect(within(pagination).getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
    await user.click(screen.getByRole('button', { name: 'First page' }))
    expect(currentParams()).toEqual({ ...initial, [pageKey]: '1' })
    await waitFor(() => expect(screen.queryByRole('heading', { name: heading })).toBeNull())
  })
})

describe('Applications workspace session changes', () => {
  it.each(['loading', 'signed-out'])('does not start private reads while the session is %s', state => {
    session.value = { ...session.value, user: state === 'signed-out' ? null : session.value.user, isLoading: state === 'loading' }
    open(`/admin/applications/${jobId}`, { ...dates, application: applicationId })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Applicants' })).toBeNull()
    expect(screen.getByRole(state === 'loading' ? 'status' : 'alert').textContent).toMatch(/session/i)
  })

  it.each(['loading', 'signed-out'])('removes loaded applicant rows, contacts, résumé links, and drawer when the session becomes %s', async state => {
    open(`/admin/applications/${jobId}`, { ...dates, application: applicationId })
    await screen.findByText('ada@example.test')
    await screen.findByRole('button', { name: 'View application from Ada James' })
    const previousDialog = screen.getByRole('dialog', { name: 'Application details' })
    expect(screen.getByRole('link', { name: 'View current résumé' })).toBeTruthy()
    act(() => changeSession(state === 'loading' ? { isLoading: true } : { user: null }))
    expect(screen.queryByText('Ada James')).toBeNull()
    expect(screen.queryByText('ada@example.test')).toBeNull()
    expect(screen.queryByText(detail.coverLetterText!)).toBeNull()
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(previousDialog.isConnected).toBe(false)
    expect(document.body.style.overflow).not.toBe('hidden')
    for (const [, options] of fetchMock.mock.calls) expect(options!.signal!.aborted).toBe(true)
  })

  it.each(['success', 'failure'])('discards pending list and detail %s after cross-tab sign-out', async outcome => {
    const list = deferred<Response>()
    const application = deferred<Response>()
    fetchMock.mockImplementation(input => String(input).includes('/applicants?') ? list.promise : application.promise)
    open(`/admin/applications/${jobId}`, { ...dates, application: applicationId })
    expect(screen.getByRole('dialog', { name: 'Application details' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    act(() => changeSession({ user: null }))
    expect(screen.queryByRole('dialog')).toBeNull()
    for (const [, options] of fetchMock.mock.calls) expect(options!.signal!.aborted).toBe(true)
    await act(async () => {
      if (outcome === 'success') {
        list.resolve(Response.json(applicants))
        application.resolve(Response.json({ application: detail }))
      } else {
        list.reject(new Error('private former-account diagnostic'))
        application.reject(new Error('private former-account diagnostic'))
      }
    })
    expect(screen.getByRole('alert').textContent).toContain('Your session has ended.')
    expect(screen.queryByText(/Ada James|ada@example.test|private former-account/)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('discards loaded private state on account change before fresh authorization settles', async () => {
    open(`/admin/applications/${jobId}`, { ...dates, application: applicationId })
    await screen.findByText('ada@example.test')
    await screen.findByRole('button', { name: 'View application from Ada James' })
    const previousDialog = screen.getByRole('dialog', { name: 'Application details' })
    const firstSignals = fetchMock.mock.calls.map(([, options]) => options!.signal!)
    const list = deferred<Response>()
    const application = deferred<Response>()
    fetchMock.mockImplementation(input => String(input).includes('/applicants?') ? list.promise : application.promise)
    act(() => changeSession({ user: { id: 'synthetic-admin-two' } }))
    expect(screen.queryByText('ada@example.test')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View application from Ada James' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    expect(previousDialog.isConnected).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Application details' })).not.toBe(previousDialog)
    expect(firstSignals.every(signal => signal.aborted)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await act(async () => {
      list.resolve(Response.json({ error: 'Access denied' }, { status: 403 }))
      application.resolve(Response.json({ error: 'Access denied' }, { status: 403 }))
    })
    expect(await screen.findByText('Your admin session is unavailable. Sign in again to continue.')).toBeTruthy()
    expect(screen.getByText('Application details are unavailable.')).toBeTruthy()
    expect(screen.queryByText('ada@example.test')).toBeNull()
  })

  it('ignores former-account pending responses after the replacement account has loaded', async () => {
    const oldList = deferred<Response>()
    const oldDetail = deferred<Response>()
    fetchMock.mockImplementation(input => String(input).includes('/applicants?') ? oldList.promise : oldDetail.promise)
    open(`/admin/applications/${jobId}`, { ...dates, application: applicationId })
    const previousDialog = screen.getByRole('dialog', { name: 'Application details' })
    const oldSignals = fetchMock.mock.calls.map(([, options]) => options!.signal!)
    fetchMock.mockImplementation(async input => String(input).includes('/applicants?')
      ? Response.json({ ...applicants, applications: [{ ...applicants.applications[0], applicant: { ...applicants.applications[0].applicant, firstName: 'Bea', lastName: 'Thomas' } }] })
      : Response.json({ application: { ...detail, applicant: { ...detail.applicant, firstName: 'Bea', lastName: 'Thomas', email: 'bea@example.test' } } }))
    act(() => changeSession({ user: { id: 'synthetic-admin-two' } }))
    await screen.findByText('bea@example.test')
    await screen.findByRole('button', { name: 'View application from Bea Thomas' })
    expect(oldSignals.every(signal => signal.aborted)).toBe(true)
    expect(previousDialog.isConnected).toBe(false)
    await act(async () => {
      oldList.resolve(Response.json(applicants))
      oldDetail.resolve(Response.json({ application: detail }))
    })
    expect(screen.getByText('bea@example.test')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View application from Bea Thomas' })).toBeTruthy()
    expect(screen.queryByText('ada@example.test')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View application from Ada James' })).toBeNull()
  })
})
