import { createRef, useRef, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApplicationDetailDrawer from '@/components/admin-applications/ApplicationDetailDrawer'
import type { ApplicationDetail } from '@/lib/admin-applications'

const applicationId = '11111111-1111-4111-8111-111111111111'
const secondApplicationId = '22222222-2222-4222-8222-222222222222'
const jobId = '33333333-3333-4333-8333-333333333333'
const secondJobId = '44444444-4444-4444-8444-444444444444'
const profileId = '55555555-5555-4555-8555-555555555555'
const userId = '66666666-6666-4666-8666-666666666666'
const companyId = '77777777-7777-4777-8777-777777777777'
const otherProfileId = '88888888-8888-4888-8888-888888888888'
const uploadedHref = `/api/cv-download?profileId=${profileId}`
const builtHref = `/api/cv/export?userId=${userId}`
const fetchMock = vi.fn<typeof fetch>()
const onClose = vi.fn()
let storageWrite: ReturnType<typeof vi.spyOn>

function fixture(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    id: applicationId, jobId, appliedAt: '2026-10-08T14:30:00Z', status: 'interview',
    coverLetterText: 'I would like to join your hospitality team.',
    job: { id: jobId, title: 'Guest Services Associate', company: { id: companyId, name: 'Harbour Hotel' } },
    applicant: {
      id: profileId, userId, firstName: 'Ada', lastName: 'James',
      email: 'ada@example.test', phone: '+1 (268) 555-0199', location: 'St. John’s',
    },
    resume: { label: 'Current résumé', uploadedHref, builtHref }, notificationTracking: 'not_tracked',
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

function drawer(id: string | null = applicationId, currentJob = jobId) {
  return <ApplicationDetailDrawer applicationId={id} jobId={currentJob} onClose={onClose} />
}

function ControlledDrawer() {
  const [selected, setSelected] = useState<string | null>(null)
  const opener = useRef<HTMLButtonElement>(null)
  return <>
    <button ref={opener} onClick={() => setSelected(applicationId)}>Open Ada’s application</button>
    <ApplicationDetailDrawer applicationId={selected} jobId={jobId} returnFocusRef={opener}
      onClose={() => { onClose(); setSelected(null) }} />
  </>
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  fetchMock.mockReset()
  onClose.mockReset()
  fetchMock.mockImplementation(async () => Response.json({ application: fixture() }))
  vi.stubGlobal('fetch', fetchMock)
  // happyDOM does not implement native modal focus containment. These stubs
  // only expose open/closed state; focus restoration and cancel are tested below.
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
    this.open = true
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.open = false
  })
  storageWrite = vi.spyOn(Storage.prototype, 'setItem')
})

afterEach(() => {
  cleanup()
  expect(storageWrite).not.toHaveBeenCalled()
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('admin application detail drawer', () => {
  it('does not fetch or expose a dialog when no application is selected', () => {
    render(drawer(null))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Ada James')).toBeNull()
  })

  it('opens an accessible native dialog and fetches private detail without caching', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    render(drawer())
    const dialog = screen.getByRole('dialog', { name: 'Application details' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    expect(within(dialog).getByRole('heading', { name: 'Application details' })).toBeTruthy()
    expect(within(dialog).getByRole('status').textContent).toBe('Loading application details…')
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/applications/${applicationId}`, expect.objectContaining({
      cache: 'no-store', signal: expect.any(AbortSignal),
    }))
    expect(fetchMock.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    await act(async () => pending.resolve(Response.json({ application: fixture() })))
    expect(await screen.findByText('Ada James')).toBeTruthy()
    expect(screen.getByText('Guest Services Associate')).toBeTruthy()
    expect(screen.getByText('Harbour Hotel')).toBeTruthy()
    expect(screen.queryByText('Loading application details…')).toBeNull()
  })

  it('uses one close control for the accessible desktop label and mobile Back text', async () => {
    render(drawer())
    await screen.findByText('Ada James')
    const close = screen.getByRole('button', { name: 'Close application details' })
    expect(within(close).getByText('Back')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Close application details' })).toHaveLength(1)
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each(['http', 'network', 'invalid-json'] as const)('shows a generic unavailable state for %s failure and retries', async failure => {
    if (failure === 'http') fetchMock.mockResolvedValueOnce(Response.json({ error: 'private server diagnostic' }, { status: 503 }))
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('private network diagnostic'))
    if (failure === 'invalid-json') fetchMock.mockResolvedValueOnce(new Response('not JSON', { status: 200 }))
    render(drawer())
    expect(await screen.findByText('Application details are unavailable.')).toBeTruthy()
    expect(screen.queryByText(/private.*diagnostic/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Ada James')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Application details are unavailable.')).toBeNull()
  })

  it.each([
    { id: secondApplicationId },
    { jobId: secondJobId },
    { job: { id: secondJobId, title: 'Wrong job', company: null } },
  ])('rejects a response whose application or job identity does not match the selection: %j', async mismatch => {
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture(mismatch) }))
    render(drawer())
    expect(await screen.findByText('Application details are unavailable.')).toBeTruthy()
    expect(screen.queryByText('Ada James')).toBeNull()
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
  })

  it.each([null, undefined])('handles missing application payload %j as unavailable', async application => {
    fetchMock.mockResolvedValueOnce(Response.json({ application }))
    render(drawer())
    expect(await screen.findByText('Application details are unavailable.')).toBeTruthy()
  })

  it('clears loaded private data immediately when a different application is selected', async () => {
    const view = render(drawer())
    await screen.findByText('Ada James')
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    view.rerender(drawer(secondApplicationId))
    expect(screen.queryByText('Ada James')).toBeNull()
    expect(screen.queryByText('ada@example.test')).toBeNull()
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Loading application details…')
    const next = fixture({ id: secondApplicationId, applicant: { ...fixture().applicant!, firstName: 'Grace', lastName: 'Thomas' } })
    await act(async () => pending.resolve(Response.json({ application: next })))
    expect(await screen.findByText('Grace Thomas')).toBeTruthy()
    expect(screen.queryByText('Ada James')).toBeNull()
  })

  it('clears loaded data and revalidates the response when only the selected job changes', async () => {
    const view = render(drawer())
    await screen.findByText('Ada James')
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    view.rerender(drawer(applicationId, secondJobId))
    expect(screen.queryByText('Ada James')).toBeNull()
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    await act(async () => pending.resolve(Response.json({ application: fixture() })))
    expect(await screen.findByText('Application details are unavailable.')).toBeTruthy()
  })

  it('aborts the superseded request and ignores a stale response even if fetch does not honor abort', async () => {
    const older = deferred<Response>()
    const newer = deferred<Response>()
    fetchMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const view = render(drawer())
    const firstSignal = fetchMock.mock.calls[0][1]!.signal!
    view.rerender(drawer(secondApplicationId))
    expect(firstSignal.aborted).toBe(true)
    const next = fixture({ id: secondApplicationId, applicant: { ...fixture().applicant!, firstName: 'Grace', lastName: 'Thomas' } })
    await act(async () => newer.resolve(Response.json({ application: next })))
    await screen.findByText('Grace Thomas')
    await act(async () => older.resolve(Response.json({ application: fixture() })))
    expect(screen.getByText('Grace Thomas')).toBeTruthy()
    expect(screen.queryByText('Ada James')).toBeNull()
    expect(screen.queryByText('Application details are unavailable.')).toBeNull()
  })

  it('ignores a stale failed request after the newer application has loaded', async () => {
    const older = deferred<Response>()
    fetchMock.mockReturnValueOnce(older.promise)
    const view = render(drawer())
    const next = fixture({ id: secondApplicationId, applicant: { ...fixture().applicant!, firstName: 'Grace', lastName: 'Thomas' } })
    fetchMock.mockResolvedValueOnce(Response.json({ application: next }))
    view.rerender(drawer(secondApplicationId))
    await screen.findByText('Grace Thomas')
    await act(async () => older.reject(new Error('stale failure')))
    expect(screen.getByText('Grace Thomas')).toBeTruthy()
    expect(screen.queryByText('Application details are unavailable.')).toBeNull()
  })

  it('aborts on close and does not expose a late result after selection is cleared', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    const view = render(drawer())
    const signal = fetchMock.mock.calls[0][1]!.signal!
    view.rerender(drawer(null))
    expect(signal.aborted).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => pending.resolve(Response.json({ application: fixture() })))
    expect(screen.queryByText('Ada James')).toBeNull()
    expect(screen.queryByText('ada@example.test')).toBeNull()
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
  })

  it('aborts an in-flight request when the drawer unmounts', () => {
    fetchMock.mockReturnValueOnce(deferred<Response>().promise)
    const view = render(drawer())
    const signal = fetchMock.mock.calls[0][1]!.signal!
    view.unmount()
    expect(signal.aborted).toBe(true)
  })

  it('dismisses an in-flight request before parent rerender and restores the previously active opener without a ref', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Original opener'
    document.body.append(opener)
    opener.focus()
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    const view = render(drawer())
    try {
      const signal = fetchMock.mock.calls[0][1]!.signal!
      fireEvent.click(screen.getByRole('button', { name: 'Close application details' }))
      expect(signal.aborted).toBe(true)
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => expect(document.activeElement).toBe(opener))
      await act(async () => pending.resolve(Response.json({ application: fixture() })))
      expect(screen.queryByText('Ada James')).toBeNull()
      expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    } finally { view.unmount(); opener.remove() }
  })

  it('handles native dialog cancellation, clears private content, and restores the opener', async () => {
    render(<ControlledDrawer />)
    const opener = screen.getByRole('button', { name: 'Open Ada’s application' })
    opener.focus()
    fireEvent.click(opener)
    await screen.findByText('Ada James')
    const dialog = screen.getByRole('dialog', { name: 'Application details' })
    screen.getByRole('button', { name: 'Close application details' }).focus()
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Ada James')).toBeNull()
    expect(screen.queryByText('ada@example.test')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('restores a supplied focus target when closing with the Back/close control', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Applicant row opener'
    document.body.append(opener)
    opener.focus()
    const returnFocusRef = createRef<HTMLElement>()
    returnFocusRef.current = opener
    const view = render(<ApplicationDetailDrawer applicationId={applicationId} jobId={jobId} onClose={onClose} returnFocusRef={returnFocusRef} />)
    try {
      await screen.findByText('Ada James')
      const close = screen.getByRole('button', { name: 'Close application details' })
      close.focus()
      fireEvent.click(close)
      expect(onClose).toHaveBeenCalledTimes(1)
      view.rerender(<ApplicationDetailDrawer applicationId={null} jobId={jobId} onClose={onClose} returnFocusRef={returnFocusRef} />)
      await waitFor(() => expect(document.activeElement).toBe(opener))
    } finally { view.unmount(); opener.remove() }
  })

  it('prefers the protected uploaded résumé and offers the protected built version separately', async () => {
    render(drawer())
    expect((await screen.findByRole('link', { name: 'View current résumé' })).getAttribute('href')).toBe(uploadedHref)
    expect(screen.getByRole('link', { name: 'Built résumé' }).getAttribute('href')).toBe(builtHref)
    expect(screen.getByRole('heading', { name: 'Current résumé' })).toBeTruthy()
    expect(screen.getByText(/snapshot|time of application|since.*appl|latest.*profile/i)).toBeTruthy()
  })

  it('uses the protected built résumé as the primary link when no upload exists', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({ resume: { label: 'Current résumé', uploadedHref: null, builtHref } }) }))
    render(drawer())
    expect((await screen.findByRole('link', { name: 'View current résumé' })).getAttribute('href')).toBe(builtHref)
  })

  it.each([
    'https://evil.example/cv.pdf', '//evil.example/cv.pdf', 'javascript:alert(1)',
    '/storage/v1/object/public/cvs/applicant.pdf', `/api/cv-download?profileId=${otherProfileId}`,
    `${uploadedHref}&redirect=https://evil.example`,
  ])('rejects an unsafe or wrong-applicant uploaded résumé link %j', async href => {
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({ resume: { label: 'Current résumé', uploadedHref: href, builtHref: null } }) }))
    render(drawer())
    await screen.findByText('Ada James')
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    expect(Array.from(document.querySelectorAll('a')).some(link => link.getAttribute('href') === href)).toBe(false)
  })

  it.each([`/api/cv/export?userId=${otherProfileId}`, 'https://evil.example/built.pdf', `${builtHref}&download=true`])('rejects an unsafe or wrong-user built résumé link %j', async href => {
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({ resume: { label: 'Current résumé', uploadedHref: null, builtHref: href } }) }))
    render(drawer())
    await screen.findByText('Ada James')
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Built résumé' })).toBeNull()
  })

  it('supports missing applicant, job, contact and résumé data without retaining links', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({
      applicant: null, job: null, coverLetterText: null,
      resume: { label: 'Current résumé', uploadedHref: null, builtHref: null },
    }) }))
    render(drawer())
    await waitFor(() => expect(screen.queryByText('Loading application details…')).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Application details' })).toBeTruthy()
    expect(screen.queryByText('Application details are unavailable.')).toBeNull()
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    expect(document.querySelector('a[href^="mailto:"],a[href^="tel:"]')).toBeNull()
  })

  it.each([null, undefined])('handles a null or absent résumé object %j without exposing links', async resume => {
    fetchMock.mockResolvedValueOnce(Response.json({ application: { ...fixture(), resume } }))
    render(drawer())
    await screen.findByText('Ada James')
    expect(screen.queryByText('Application details are unavailable.')).toBeNull()
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Built résumé' })).toBeNull()
  })

  it('does not expose résumé URLs when the owning applicant is missing', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({ applicant: null }) }))
    render(drawer())
    await waitFor(() => expect(screen.queryByText('Loading application details…')).toBeNull())
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Built résumé' })).toBeNull()
  })

  it('uses safe fallback labels for missing names and an unknown application status', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({
      applicant: { ...fixture().applicant!, firstName: null, lastName: null, email: null, phone: null, location: null },
      status: 'unexpected-status',
    }) }))
    render(drawer())
    expect(await screen.findByText('Name unavailable')).toBeTruthy()
    expect(screen.getByText('Status unavailable')).toBeTruthy()
    expect(screen.queryByText('unexpected-status')).toBeNull()
    expect(document.querySelector('a[href^="mailto:"],a[href^="tel:"]')).toBeNull()
  })

  it('links validated contact values with mailto/tel only', async () => {
    render(drawer())
    await screen.findByText('Ada James')
    const email = screen.getByRole('link', { name: 'ada@example.test' })
    expect(email.getAttribute('href')).toBe('mailto:ada@example.test')
    const phone = screen.getByRole('link', { name: '+1 (268) 555-0199' })
    expect(phone.getAttribute('href')!.replace(/[\s()-]/g, '')).toBe('tel:+12685550199')
  })

  it.each([
    ['javascript:alert(1)', 'javascript:alert(2)'],
    ['ada@example.test?subject=Injected', '+1 268 555 0199;body=Injected'],
    ['ada@example.test\r\nBcc:another@example.test', '<img src=x onerror=alert(1)>'],
    ['ada@example.test\n', '+1 268 555 0199\n'],
  ])('renders malicious contact values as plain text rather than hrefs', async (email, phone) => {
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({ applicant: { ...fixture().applicant!, email, phone } }) }))
    render(drawer())
    await screen.findByText('Ada James')
    const dialog = screen.getByRole('dialog', { name: 'Application details' })
    expect(dialog.textContent).toContain(email)
    expect(dialog.textContent).toContain(phone)
    expect(dialog.querySelector('a[href^="mailto:"],a[href^="tel:"],a[href^="javascript:"]')).toBeNull()
    expect(dialog.querySelector('img')).toBeNull()
  })

  it('renders cover-letter HTML literally and provides no notification actions', async () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="https://evil.example">Click</a>'
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({ coverLetterText: payload }) }))
    render(drawer())
    expect(await screen.findByText(payload)).toBeTruthy()
    const dialog = screen.getByRole('dialog', { name: 'Application details' })
    expect(dialog.querySelector('script,img,a[href="https://evil.example"]')).toBeNull()
    expect(screen.getByText('Employer notification')).toBeTruthy()
    expect(screen.getByText('Not tracked')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /send|notify|resend|mark.*sent/i })).toBeNull()
  })

  it('expands and collapses long letters accessibly and resets expansion for the next selection', async () => {
    const letter = `${'Relevant experience. '.repeat(40)}Unique final sentence.`
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({ coverLetterText: letter }) }))
    const view = render(drawer())
    const expand = await screen.findByRole('button', { name: /Expand/i })
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    const controlledId = expand.getAttribute('aria-controls')
    expect(controlledId).toBeTruthy()
    expect(document.getElementById(controlledId!)).toBeTruthy()
    fireEvent.click(expand)
    const collapse = screen.getByRole('button', { name: /Collapse/i })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    expect(collapse.getAttribute('aria-controls')).toBe(controlledId)
    expect(document.getElementById(controlledId!)!.textContent).toContain('Unique final sentence.')
    fireEvent.click(collapse)
    expect(screen.getByRole('button', { name: /Expand/i }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /Expand/i }))
    fetchMock.mockResolvedValueOnce(Response.json({ application: fixture({ id: secondApplicationId, coverLetterText: letter }) }))
    view.rerender(drawer(secondApplicationId))
    const reset = await screen.findByRole('button', { name: /Expand/i })
    expect(reset.getAttribute('aria-expanded')).toBe('false')
  })

  it('clears loaded details on close and refetches on reopen without browser-storage persistence', async () => {
    const view = render(drawer())
    await screen.findByText('Ada James')
    view.rerender(drawer(null))
    expect(screen.queryByText('Ada James')).toBeNull()
    expect(screen.queryByText('I would like to join your hospitality team.')).toBeNull()
    expect(screen.queryByRole('link', { name: 'View current résumé' })).toBeNull()
    view.rerender(drawer())
    await screen.findByText('Ada James')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(storageWrite).not.toHaveBeenCalled()
  })
})
