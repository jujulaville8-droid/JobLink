import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CvUpload from '@/components/CvUpload'
import { CV_TYPES, CV_FALLBACK, MAX_CV_BYTES, ownedCvPath, validateCvFile } from '@/lib/cv-upload'

it.each(Object.entries(CV_TYPES))('accepts %s with matching, empty and Android MIME types', (ext, type) => {
  for (const mime of [type, '', 'application/octet-stream', 'application/x-pdf']) {
    expect(validateCvFile({ name: `Resume.${ext.toUpperCase()}`, size: 123, type: mime })).toMatchObject({ extension: ext, contentType: type })
  }
})
it.each([3 * 1024 * 1024, 8 * 1024 * 1024, MAX_CV_BYTES - 1, MAX_CV_BYTES])('accepts PDF at %i bytes', size => {
  expect(validateCvFile({ name: 'cv.pdf', size }).error).toBeUndefined()
})
it.each([MAX_CV_BYTES + 1, 0, -1, NaN])('rejects invalid size %i', size => {
  expect(validateCvFile({ name: 'cv.pdf', size }).error).toBeTruthy()
})
it.each(['resume.exe', 'resume.svg', 'resume.pdf.exe'])('rejects %s without a recognized MIME', name => {
  expect(validateCvFile({ name, size: 100, type: 'application/octet-stream' }).error).toMatch(/Unsupported/)
})
it('uses MIME for extensionless documents and rejects unrecognized ones', () => {
  expect(validateCvFile({ name: 'resume', size: 100, type: 'application/pdf' })).toMatchObject({ extension: 'pdf' })
  expect(validateCvFile({ name: 'resume', size: 100, type: '' }).error).toBeTruthy()
})
it('rejects foreign, nested, URL, and traversal paths', () => {
  for (const path of ['other/cv.pdf', 'u/../cv.pdf', 'u/a/b.pdf', 'u/%2f.pdf', 'https://example/cv.pdf', 'u/cv.exe']) expect(ownedCvPath(path, 'u')).toBe(false)
  expect(ownedCvPath('u/cv-uuid.heic', 'u')).toBe(true)
})

class UploadRequest {
  static latest: UploadRequest
  upload = { onprogress: null as null | ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) }
  status = 200
  timeout = 0
  onload?: () => void
  onerror?: () => void
  ontimeout?: () => void
  onabort?: () => void
  open = vi.fn()
  setRequestHeader = vi.fn()
  send = vi.fn()
  constructor() { UploadRequest.latest = this }
}
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(Response.json({ path: 'u/new.pdf', signedUrl: 'https://storage.test/upload?token=signed' }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('XMLHttpRequest', UploadRequest)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function setup() {
  const saved = vi.fn(), busy = vi.fn()
  render(<CvUpload onUploaded={saved} onBusy={busy} hasCv />)
  const input = screen.getByLabelText('Upload your CV') as HTMLInputElement
  const choose = (file = new File(['%PDF-test'], 'cv.pdf', { type: 'application/octet-stream' })) => fireEvent.change(input, { target: { files: [file] } })
  return { saved, busy, input, choose }
}
it('shows fallback, direct transfer progress, disables input and records only successful uploads', async () => {
  const { choose, saved, input, busy } = setup()
  expect(screen.getByText(CV_FALLBACK)).toBeTruthy()
  choose()
  await waitFor(() => expect(UploadRequest.latest.send).toHaveBeenCalled())
  expect(input.disabled).toBe(true)
  expect(saved).not.toHaveBeenCalled()
  expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ name: 'cv.pdf', size: 9, type: 'application/octet-stream' }))
  expect(UploadRequest.latest.open).toHaveBeenCalledWith('PUT', 'https://storage.test/upload?token=signed')
  expect(UploadRequest.latest.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf')
  UploadRequest.latest.upload.onprogress?.({ loaded: 50, total: 100, lengthComputable: true })
  expect(await screen.findByText(/Uploading resume… 50%/)).toBeTruthy()
  UploadRequest.latest.onload?.()
  await waitFor(() => expect(saved).toHaveBeenCalledWith('u/new.pdf'))
  expect(busy).toHaveBeenLastCalledWith(false)
  expect(input.disabled).toBe(false)
})
it.each(['network', 'timeout', 'forbidden', 'too-large', 'server'] as const)('surfaces %s transfer failures and permits retrying the same file', async failure => {
  const { choose, saved, input } = setup()
  choose(); await waitFor(() => expect(UploadRequest.latest.send).toHaveBeenCalled())
  const xhr = UploadRequest.latest
  if (failure === 'network') xhr.onerror?.()
  else if (failure === 'timeout') xhr.ontimeout?.()
  else { xhr.status = failure === 'forbidden' ? 403 : failure === 'too-large' ? 413 : 500; xhr.onload?.() }
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(saved).not.toHaveBeenCalled()
  expect(input.disabled).toBe(false)
  choose(); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
})
it.each(['thrown', 'json', 'auth', 'storage'])('surfaces %s authorization failures without altering the old CV', async failure => {
  if (failure === 'thrown') fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  else if (failure === 'json') fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
  else fetchMock.mockResolvedValue(Response.json({ error: failure === 'auth' ? 'Please verify your email first' : 'Could not authorize upload' }, { status: 403 }))
  const { choose, saved, input } = setup(); choose()
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(input.disabled).toBe(false)
  expect(saved).not.toHaveBeenCalled()
})
it('shows wrong type and too-large errors before calling the server', async () => {
  const { choose } = setup()
  choose(new File(['x'], 'cv.exe'))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Unsupported'))
  const large = new File(['x'], 'cv.pdf'); Object.defineProperty(large, 'size', { value: MAX_CV_BYTES + 1 })
  choose(large)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('too large'))
  expect(fetchMock).not.toHaveBeenCalled()
})

it.each(['Resume.pdf ', 'CV.pdf (1)', 'resume.unknown', 'resume.pdf.exe'])('accepts %s with recognized PDF MIME fallback', name => {
  expect(validateCvFile({ name, size: 100, type: 'application/pdf' })).toMatchObject({ extension: 'pdf', contentType: 'application/pdf' })
})
it.each(['Resume.pdf ', 'CV.pdf (1)'])('extracts the extension from noisy filename %s without MIME', name => {
  expect(validateCvFile({ name, size: 100 })).toMatchObject({ extension: 'pdf' })
})
