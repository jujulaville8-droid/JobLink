// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), createAdmin: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(),
  update: vi.fn(), maybeSingle: vi.fn(), single: vi.fn(), storageFrom: vi.fn(),
  upload: vi.fn(), download: vi.fn(), getPublicUrl: vi.fn(), remove: vi.fn(),
}))
vi.mock('@/lib/api-auth', () => ({ requireAdmin: mocks.auth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdmin }))
import { POST } from '@/app/api/admin/companies/logo/route'

const origin = 'https://example-project.supabase.co'
const companyId = '9fde7fc7-70b3-4354-9d11-d520f4ec09f9'
const ownerId = '11111111-1111-4111-8111-111111111111'
const company = { id: companyId, user_id: ownerId, company_name: 'Example Employer', logo_url: null }
const storageUrl = (path: string) => `${origin}/storage/v1/object/public/company-logos/${path}`
const sendJson = (body: unknown) => POST(new NextRequest('https://joblinkantigua.com/api/admin/companies/logo', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))
async function sendFile(bytes: Uint8Array, type = 'image/png', fileName = 'logo.png') {
  const form = new FormData()
  form.set('company_id', companyId)
  form.set('file', new File([Uint8Array.from(bytes)], fileName, { type }))
  return POST(new NextRequest('https://joblinkantigua.com/api/admin/companies/logo', { method: 'POST', body: form }))
}
const imageBytes = (format: 'png' | 'jpeg' | 'webp', width = 300, height = 150) => sharp({
  create: { width, height, channels: 3, background: '#123456' },
}).toFormat(format).toBuffer()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin)
  mocks.auth.mockResolvedValue({ user: { id: 'admin' }, isAdmin: true })
  const query = {
    select: mocks.select, eq: mocks.eq, update: mocks.update,
    maybeSingle: mocks.maybeSingle, single: mocks.single,
  }
  for (const mock of [mocks.select, mocks.eq, mocks.update]) mock.mockReturnValue(query)
  mocks.from.mockReturnValue(query)
  mocks.maybeSingle.mockResolvedValue({ data: company, error: null })
  mocks.single.mockResolvedValue({ data: company, error: null })
  const storage = { upload: mocks.upload, download: mocks.download, getPublicUrl: mocks.getPublicUrl, remove: mocks.remove }
  mocks.storageFrom.mockReturnValue(storage)
  mocks.createAdmin.mockReturnValue({ from: mocks.from, storage: { from: mocks.storageFrom } })
  mocks.upload.mockResolvedValue({ data: {}, error: null })
  mocks.download.mockImplementation(async () => ({ data: new Blob([Uint8Array.from(await imageBytes('png'))], { type: 'image/png' }), error: null }))
  mocks.remove.mockResolvedValue({ data: [], error: null })
  mocks.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: storageUrl(path) } }))
})
afterAll(() => vi.unstubAllEnvs())

describe('admin company logo boundary', () => {
  it.each([401, 403])('requires server admin authorization before a storage or database operation (%s)', async status => {
    mocks.auth.mockResolvedValue({ error: NextResponse.json({ error: 'Not allowed' }, { status }) })
    expect((await sendJson({ company_id: companyId, logo_url: '' })).status).toBe(status)
    expect(mocks.createAdmin).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([null, [], {}, { company_id: 'not-a-uuid', logo_url: '' }, { company_id: companyId + '/other', logo_url: '' }])(
    'rejects malformed request %j before writing', async body => {
      expect((await sendJson(body)).status).toBe(400)
      expect(mocks.upload).not.toHaveBeenCalled()
      expect(mocks.update).not.toHaveBeenCalled()
    },
  )

  it('rejects missing replacement data rather than silently clearing a logo', async () => {
    expect((await sendJson({ company_id: companyId })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON and multipart data without writing', async () => {
    for (const contentType of ['application/json', 'multipart/form-data; boundary=missing']) {
      const response = await POST(new NextRequest('https://joblinkantigua.com/api/admin/companies/logo', {
        method: 'POST', headers: { 'Content-Type': contentType }, body: '{',
      }))
      expect(response.status).toBe(400)
    }
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects an ambiguous request containing both a file and a URL', async () => {
    const form = new FormData()
    form.set('company_id', companyId)
    form.set('file', new File([Uint8Array.from(await imageBytes('png'))], 'logo.png', { type: 'image/png' }))
    form.set('logo_url', storageUrl(`admin/${companyId}/old.png`))
    const response = await POST(new NextRequest('https://joblinkantigua.com/api/admin/companies/logo', { method: 'POST', body: form }))
    expect(response.status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['', '   ', null])('clears a logo explicitly with %j', async logoUrl => {
    const response = await sendJson({ company_id: companyId, logo_url: logoUrl })
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ logo_url: null })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it.each([`admin/${companyId}/logo.png`, `${ownerId}/logo.png`])(
    'copies a decoded existing logo owned by this company into a new safe raster at %s', async path => {
      const logoUrl = storageUrl(path)
      expect((await sendJson({ company_id: companyId, logo_url: logoUrl })).status).toBe(200)
      expect(mocks.download).toHaveBeenCalledWith(path)
      const [uploadedPath, bytes, options] = mocks.upload.mock.calls[0]
      expect(uploadedPath).toMatch(new RegExp(`^admin/${companyId}/[0-9a-f-]{36}\\.png$`))
      expect(options).toMatchObject({ contentType: 'image/png', upsert: false })
      expect((await sharp(bytes).metadata()).format).toBe('png')
      expect(mocks.update).toHaveBeenCalledWith({ logo_url: storageUrl(uploadedPath) })
    },
  )

  it.each([
    { data: null, error: null }, { data: null, error: { message: 'private missing-object diagnostic' } },
  ])('refuses to save a pasted URL when its object cannot be downloaded', async downloadResult => {
    mocks.download.mockResolvedValue(downloadResult)
    const response = await sendJson({ company_id: companyId, logo_url: storageUrl(`admin/${companyId}/logo.png`) })
    expect(response.status).toBe(400)
    expect(JSON.stringify(await response.json())).not.toContain('private missing-object diagnostic')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['text/html', 'image/png'])('refuses a pasted PNG URL containing HTML declared as %s', async contentType => {
    mocks.download.mockResolvedValue({ data: new Blob(['<script>not an image</script>'], { type: contentType }), error: null })
    expect((await sendJson({ company_id: companyId, logo_url: storageUrl(`admin/${companyId}/logo.png`) })).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('refuses a pasted URL whose storage object exceeds the upload byte limit', async () => {
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), error: null })
    expect((await sendJson({ company_id: companyId, logo_url: storageUrl(`admin/${companyId}/logo.png`) })).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([
    'https://untrusted.example/logo.png', 'http://example-project.supabase.co/storage/v1/object/public/company-logos/logo.png',
    `${origin}.evil.example/storage/v1/object/public/company-logos/admin/${companyId}/logo.png`,
    `${origin}/storage/v1/object/public/resumes/admin/${companyId}/cv.pdf`,
    storageUrl('admin/22222222-2222-4222-8222-222222222222/logo.png'),
    storageUrl('22222222-2222-4222-8222-222222222222/logo.png'),
    storageUrl(`admin/${companyId}/logo.png?token=private`), storageUrl(`admin/${companyId}/logo.png#fragment`),
    storageUrl(`admin/${companyId}/../other.png`), storageUrl(`admin/${companyId}/%2e%2e/other.png`),
    storageUrl(`admin/${companyId}/nested%2Fother.png`),
    storageUrl(`admin/${companyId}/logo.svg`), storageUrl(`admin/${companyId}/logo.html`),
    storageUrl(`admin/${companyId}/logo`),
    `https://user:secret@example-project.supabase.co/storage/v1/object/public/company-logos/admin/${companyId}/logo.png`,
    { url: storageUrl(`admin/${companyId}/logo.png`) },
  ])('refuses a URL outside safe company storage scope: %j', async logoUrl => {
    expect((await sendJson({ company_id: companyId, logo_url: logoUrl })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('fails closed when the Supabase origin is unavailable', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    expect((await sendJson({ company_id: companyId, logo_url: storageUrl(`admin/${companyId}/logo.png`) })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['png', 'jpeg', 'webp'] as const)('decodes a genuine %s image and uploads a bounded PNG under a unique company path', async format => {
    const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`
    const response = await sendFile(await imageBytes(format), mime, `../../untrusted.${format}`)
    expect(response.status).toBe(200)
    expect(mocks.storageFrom).toHaveBeenCalledWith('company-logos')
    expect(mocks.upload).toHaveBeenCalledOnce()
    const [path, bytes, options] = mocks.upload.mock.calls[0]
    expect(path).toMatch(new RegExp(`^admin/${companyId}/[0-9a-f-]{36}\\.png$`))
    expect(options).toMatchObject({ contentType: 'image/png', upsert: false })
    const metadata = await sharp(bytes).metadata()
    expect(metadata.format).toBe('png')
    expect(metadata.width).toBeLessThanOrEqual(256)
    expect(metadata.height).toBeLessThanOrEqual(256)
    expect(mocks.update).toHaveBeenCalledWith({ logo_url: storageUrl(path) })
  })

  it('uses a fresh storage path for each replacement and never overwrites an object', async () => {
    const bytes = await imageBytes('png')
    expect((await sendFile(bytes)).status).toBe(200)
    expect((await sendFile(bytes)).status).toBe(200)
    const [first, second] = mocks.upload.mock.calls
    expect(first[0]).not.toBe(second[0])
    expect(first[2].upsert).toBe(false)
    expect(second[2].upsert).toBe(false)
  })

  it.each(['image/svg+xml', 'application/pdf'])('rejects unsupported declared image type %s', async mime => {
    expect((await sendFile(new TextEncoder().encode('<svg></svg>'), mime)).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects spoofed PNG content even if its filename and MIME type look valid', async () => {
    expect((await sendFile(new TextEncoder().encode('<script>not an image</script>'))).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects a genuine image whose decoded format disagrees with its declared type', async () => {
    expect((await sendFile(await imageBytes('jpeg'), 'image/png', 'logo.png')).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects an empty upload rather than treating it as a clear request', async () => {
    expect((await sendFile(new Uint8Array())).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects a file larger than 5MB before uploading', async () => {
    expect((await sendFile(new Uint8Array(5 * 1024 * 1024 + 1))).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects compressed images whose decoded dimensions exceed 16 million pixels', async () => {
    expect((await sendFile(await imageBytes('png', 4001, 4000))).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing company before uploading', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await sendFile(await imageBytes('png'))).status).toBe(404)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('returns a generic failure on company lookup errors', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'private lookup diagnostic' } })
    const response = await sendJson({ company_id: companyId, logo_url: '' })
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('private lookup diagnostic')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('does not save a logo URL after a failed storage upload', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'private storage diagnostic' } })
    const response = await sendFile(await imageBytes('png'))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('private storage diagnostic')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('removes only the newly uploaded object if saving its URL fails', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'private update diagnostic' } })
    const response = await sendFile(await imageBytes('png'))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('private update diagnostic')
    const path = mocks.upload.mock.calls[0][0]
    expect(mocks.remove).toHaveBeenCalledWith([path])
  })

  it('removes an uploaded object if storage returns a public URL outside the safe origin', async () => {
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://untrusted.example/logo.png' } })
    expect((await sendFile(await imageBytes('png'))).status).toBe(503)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]])
  })
})
