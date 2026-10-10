import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ComponentProps, type ReactNode } from 'react'
import AdminBentoDashboard from '@/components/AdminBentoDashboard'
import AdminApplicationsPreview from '@/components/admin-applications/AdminApplicationsPreview'
import SidebarNav from '@/components/SidebarNav'
import type { ApplicationOverview } from '@/lib/admin-applications'

const route = vi.hoisted(() => ({ pathname: '/dashboard', prefetch: vi.fn() }))
const auth = vi.hoisted(() => ({ user: { id: 'admin-one' } as { id: string } | null, isLoading: false }))
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => auth }))
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ prefetch: route.prefetch }),
}))
vi.mock('next/link', () => ({
  default: ({ children, onClick, ...props }: ComponentProps<'a'>) => createElement('a', {
    ...props,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event)
      event.preventDefault()
    },
  }, children),
}))
// Happy DOM cannot reliably finish native animations; preserve the rendered elements and link semantics.
vi.mock('motion/react', () => {
  const element = (tag: 'div' | 'p' | 'span') => function MotionElement({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) {
    for (const name of ['variants', 'initial', 'animate', 'transition', 'exit', 'whileHover', 'whileTap']) delete props[name]
    return createElement(tag, props, children)
  }
  return { motion: { div: element('div'), p: element('p'), span: element('span') } }
})
vi.mock('@/components/ShareToFacebook', () => ({ default: () => null }))

const overviewUrl = '/api/admin/applications/overview?limit=5&sort=latest'
const privateEmail = 'private-applicant@example.test'
const privatePhone = '+1-268-555-0199'
const scope = { from: '2026-09-05', to: '2026-10-04', timeZone: 'America/Antigua' as const }
const jobTitles = ['No applicant role', 'Guest Services Associate', 'Reservations Agent', 'Cook', 'Groundskeeper', 'Receptionist', 'Overflow role']
const jobs = jobTitles.map((title, index) => ({
  id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
  title, status: 'active', company: { id: '11111111-1111-4111-8111-111111111111', name: 'Harbour Hotel' },
  createdAt: '2026-09-01T12:00:00Z', applicationCount: index === 0 ? 0 : index,
  latestApplicationAt: index === 0 ? null : '2026-10-03T14:30:00Z',
}))
const overview: ApplicationOverview = {
  scope, page: 1, limit: 5, totalJobs: 7, jobs,
  summary: {
    applications: 21, jobsWithApplications: 6, companiesWithApplications: 1,
    statusCounts: { applied: 18, interview: 1, hold: 1, rejected: 1 },
  },
  trend: [{ date: '2026-10-03', count: 21 }],
}
const stats = {
  totalUsers: 100, totalSeekers: 80, totalEmployers: 20, totalJobs: 12, activeJobs: 9,
  pendingApprovals: 2, totalApplications: 42, totalReports: 1, proSubscribers: 3,
  newUsersThisWeek: 7, newSeekersThisWeek: 5, newEmployersThisWeek: 2,
}
const roleLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid' },
  { href: '/profile', label: 'My Profile', icon: 'user' },
  { href: '/messages', label: 'Messages', icon: 'mail' },
]
const applicationLinks = [
  { href: '/dashboard', label: 'Admin Dashboard', icon: 'grid' },
  { href: '/admin/applications', label: 'Applications', icon: 'file-text' },
  { href: '/admin/inbox', label: 'Applicant Inbox', icon: 'mail' },
  { href: '/messages', label: 'Messages', icon: 'mail' },
]
let fetchMock: ReturnType<typeof vi.fn>

function pendingResponse() {
  let resolve!: (response: Response) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  route.pathname = '/dashboard'
  auth.user = { id: 'admin-one' }
  auth.isLoading = false
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url !== overviewUrl) throw new Error(`Unexpected synthetic request: ${url}`)
    return Promise.resolve(Response.json(overview))
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  for (const [url, options] of fetchMock.mock.calls) {
    expect(url).toBe(overviewUrl)
    expect(options?.method ?? 'GET').toBe('GET')
    expect(options?.body).toBeUndefined()
    expect(options?.cache).toBe('no-store')
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('admin dashboard Applications entry', () => {
  it('makes the all-time Applications total a keyboard-accessible link without nested anchors', async () => {
    const user = userEvent.setup()
    const view = render(<AdminBentoDashboard stats={stats} recentUsers={[]} pendingJobs={[]} shareableJobs={[]} />)
    const link = screen.getByRole('link', { name: /Applications.*All time/i })
    expect(link.getAttribute('href')).toBe('/admin/applications')
    expect(within(link).getByText('42')).toBeTruthy()
    expect(within(link).getByText('All time')).toBeTruthy()
    expect(view.container.querySelector('a a')).toBeNull()
    await user.tab()
    expect(document.activeElement).toBe(link)
    for (const name of ['Recent Signups', 'Pending Approvals', 'Share to Facebook', 'Quick Links']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
  })
})

describe('recent application activity preview', () => {
  it('announces loading and cancels the read when the preview unmounts', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    const view = render(<AdminApplicationsPreview />)
    expect(screen.getByRole('heading', { name: 'Recent application activity' })).toBeTruthy()
    expect(screen.getByText('Last 30 days · By job')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/loading/i)
    expect(fetchMock).toHaveBeenCalledOnce()
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    expect(signal.aborted).toBe(false)
    view.unmount()
    expect(signal.aborted).toBe(true)
  })

  it('shows at most five jobs with applications and carries the API date scope into every job link', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      ...overview,
      jobs: overview.jobs.map(job => ({ ...job, email: privateEmail, phone: privatePhone })),
    }))
    const view = render(<AdminApplicationsPreview />)
    await screen.findByRole('link', { name: /Guest Services Associate/ })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText('No applicant role')).toBeNull()
    expect(screen.queryByText('Overflow role')).toBeNull()
    const jobLinks = screen.getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('/admin/applications/'))
    expect(jobLinks).toHaveLength(5)
    for (const [index, link] of jobLinks.entries()) {
      expect(link.textContent).toContain(jobs[index + 1].title)
      expect(link.textContent).toContain('Harbour Hotel')
      const destination = new URL(link.getAttribute('href')!, 'https://joblink.invalid')
      expect(destination.pathname).toBe(`/admin/applications/${jobs[index + 1].id}`)
      expect(Object.fromEntries(destination.searchParams)).toEqual({ from: scope.from, to: scope.to })
    }
    expect(view.container.textContent).not.toContain(privateEmail)
    expect(view.container.textContent).not.toContain(privatePhone)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([{ jobs: [] }, { jobs: [jobs[0]] }])('shows the empty state only when no jobs have recent applications %#', async ({ jobs: emptyJobs }) => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...overview, jobs: emptyJobs }))
    render(<AdminApplicationsPreview />)
    expect(await screen.findByText('No applications in the last 30 days.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('/admin/applications/'))).toHaveLength(0)
  })

  it.each(['http', 'network'])('shows a generic %s failure and replaces it with real activity after retry', async failure => {
    const user = userEvent.setup()
    if (failure === 'http') fetchMock.mockResolvedValueOnce(Response.json({ error: `Private diagnostic for ${privateEmail}` }, { status: 503 }))
    else fetchMock.mockRejectedValueOnce(new Error(`Private diagnostic for ${privateEmail}`))
    render(<AdminApplicationsPreview />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/load|try again/i)
    expect(alert.textContent).not.toContain(privateEmail)
    expect(alert.textContent).not.toContain('Private diagnostic')
    expect(screen.queryByText('No applications in the last 30 days.')).toBeNull()
    expect(screen.queryByRole('link', { name: /Guest Services Associate/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: /Guest Services Associate/ })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

describe('preview session privacy', () => {
  it('waits for authentication to settle before reading application activity', async () => {
    auth.user = null
    auth.isLoading = true
    const view = render(<AdminApplicationsPreview />)
    expect(screen.getByRole('status').textContent).toBe('Checking your admin session…')
    expect(screen.queryByRole('heading', { name: 'Recent application activity' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    auth.user = { id: 'admin-one' }
    auth.isLoading = false
    view.rerender(<AdminApplicationsPreview />)
    await screen.findByRole('link', { name: /Guest Services Associate/ })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not load activity for a signed-out session', () => {
    auth.user = null
    render(<AdminApplicationsPreview />)
    expect(screen.getByRole('alert').textContent).toBe('Your session has ended. Sign in again to view applications.')
    expect(screen.queryByRole('heading', { name: 'Recent application activity' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('immediately removes loaded private rows on sign-out', async () => {
    const view = render(<AdminApplicationsPreview />)
    await screen.findByRole('link', { name: /Guest Services Associate/ })
    const previousSignal = fetchMock.mock.calls[0][1].signal as AbortSignal

    auth.user = null
    view.rerender(<AdminApplicationsPreview />)
    expect(screen.getByRole('alert').textContent).toMatch(/session has ended/i)
    expect(screen.queryByRole('link', { name: /Guest Services Associate/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Recent application activity' })).toBeNull()
    expect(view.container.textContent).not.toContain('Harbour Hotel')
    expect(previousSignal.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('discards loaded rows while auth is loading and reads again when the same account returns', async () => {
    const view = render(<AdminApplicationsPreview />)
    await screen.findByRole('link', { name: /Guest Services Associate/ })
    const previousSignal = fetchMock.mock.calls[0][1].signal as AbortSignal
    const next = pendingResponse()
    fetchMock.mockReturnValueOnce(next.promise)

    auth.isLoading = true
    view.rerender(<AdminApplicationsPreview />)
    expect(screen.getByRole('status').textContent).toBe('Checking your admin session…')
    expect(screen.queryByRole('link', { name: /Guest Services Associate/ })).toBeNull()
    expect(previousSignal.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()

    auth.isLoading = false
    view.rerender(<AdminApplicationsPreview />)
    expect(screen.getByRole('status').textContent).toBe('Loading recent application activity…')
    expect(screen.queryByRole('link', { name: /Guest Services Associate/ })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { next.resolve(Response.json({ ...overview, jobs: [] })); await next.promise })
    expect(screen.getByText('No applications in the last 30 days.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Guest Services Associate/ })).toBeNull()
  })

  it('clears former-account rows before the replacement account read resolves', async () => {
    const view = render(<AdminApplicationsPreview />)
    await screen.findByRole('link', { name: /Guest Services Associate/ })
    const previousSignal = fetchMock.mock.calls[0][1].signal as AbortSignal
    const next = pendingResponse()
    fetchMock.mockReturnValueOnce(next.promise)

    auth.user = { id: 'admin-two' }
    view.rerender(<AdminApplicationsPreview />)
    expect(screen.queryByRole('link', { name: /Guest Services Associate/ })).toBeNull()
    expect(view.container.textContent).not.toContain('Harbour Hotel')
    expect(screen.getByRole('status').textContent).toBe('Loading recent application activity…')
    expect(previousSignal.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => {
      next.resolve(Response.json({ ...overview, jobs: [{ ...jobs[1], title: 'Replacement account activity' }] }))
      await next.promise
    })
    expect(screen.getByRole('link', { name: /Replacement account activity/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Guest Services Associate/ })).toBeNull()
  })

  it.each(['success', 'failure'])('ignores late former-account %s after the next account is ready', async outcome => {
    const previous = pendingResponse()
    fetchMock.mockReturnValueOnce(previous.promise)
    fetchMock.mockResolvedValueOnce(Response.json({ ...overview, jobs: [{ ...jobs[1], title: 'Replacement account activity' }] }))
    const view = render(<AdminApplicationsPreview />)
    const previousSignal = fetchMock.mock.calls[0][1].signal as AbortSignal

    auth.user = { id: 'admin-two' }
    view.rerender(<AdminApplicationsPreview />)
    await screen.findByRole('link', { name: /Replacement account activity/ })
    expect(previousSignal.aborted).toBe(true)
    await act(async () => {
      if (outcome === 'success') previous.resolve(Response.json(overview))
      else previous.reject(new Error(`Private former-account diagnostic: ${privateEmail}`))
      await previous.promise.catch(() => {})
    })
    expect(screen.getByRole('link', { name: /Replacement account activity/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Guest Services Associate/ })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(view.container.textContent).not.toContain(privateEmail)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('cannot restore activity from a pending request after sign-out', async () => {
    const previous = pendingResponse()
    fetchMock.mockReturnValueOnce(previous.promise)
    const view = render(<AdminApplicationsPreview />)
    const previousSignal = fetchMock.mock.calls[0][1].signal as AbortSignal

    auth.user = null
    view.rerender(<AdminApplicationsPreview />)
    expect(previousSignal.aborted).toBe(true)
    await act(async () => { previous.resolve(Response.json(overview)); await previous.promise })
    expect(screen.getByRole('alert').textContent).toMatch(/session has ended/i)
    expect(screen.queryByRole('heading', { name: 'Recent application activity' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Guest Services Associate/ })).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe('Applications sidebar navigation', () => {
  it.each(['/admin/applications', `/admin/applications/${jobs[1].id}`])('uses persistent admin links on %s', pathname => {
    route.pathname = pathname
    render(<SidebarNav links={roleLinks} applicationLinks={applicationLinks} />)
    const applications = screen.getByRole('link', { name: 'Applications' })
    expect(applications.getAttribute('href')).toBe('/admin/applications')
    expect(applications.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Applicant Inbox' }).getAttribute('href')).toBe('/admin/inbox')
    expect(screen.getByRole('link', { name: 'Admin Dashboard' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'My Profile' })).toBeNull()
  })

  it.each(['/profile', '/messages', '/admin/applications-other', '/admin/inbox'])('keeps role-specific navigation on %s', pathname => {
    route.pathname = pathname
    render(<SidebarNav links={roleLinks} applicationLinks={applicationLinks} />)
    expect(screen.getByRole('link', { name: 'My Profile' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Messages' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Applications' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Applicant Inbox' })).toBeNull()
  })

  it('retains admin links during optimistic navigation and switches only when the actual route commits', async () => {
    route.pathname = `/admin/applications/${jobs[1].id}`
    const user = userEvent.setup()
    const view = render(<SidebarNav links={roleLinks} applicationLinks={applicationLinks} />)
    await user.click(screen.getByRole('link', { name: 'Messages' }))
    expect(screen.getByRole('link', { name: 'Messages' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('link', { name: 'Applications' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Applicant Inbox' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'My Profile' })).toBeNull()
    route.pathname = '/messages'
    view.rerender(<SidebarNav links={roleLinks} applicationLinks={applicationLinks} />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Messages' }).getAttribute('aria-current')).toBe('page'))
    expect(screen.getByRole('link', { name: 'Messages' }).getAttribute('aria-busy')).toBeNull()
    expect(screen.getByRole('link', { name: 'My Profile' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Applications' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Applicant Inbox' })).toBeNull()
  })

  it('does not invent admin navigation when no application links were supplied', () => {
    route.pathname = '/admin/applications'
    render(<SidebarNav links={roleLinks} />)
    expect(screen.getByRole('link', { name: 'My Profile' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Applications' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Applicant Inbox' })).toBeNull()
  })
})
