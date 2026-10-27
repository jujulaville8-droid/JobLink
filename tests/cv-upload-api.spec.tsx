// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { MAX_CV_BYTES } from '@/lib/cv-upload'
const state = vi.hoisted(() => ({ auth: 0, limited: false, currentCv: null as string | null, sign: vi.fn(), info: vi.fn(), writes: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ requireVerifiedUser: async () => state.auth
  ? { error: NextResponse.json({ error: 'Sign in again' }, { status: state.auth }) }
  : { user: { id: 'user-1', email: 'u@example.test' }, supabase: {
    storage: { from: () => ({ createSignedUploadUrl: state.sign, info: state.info }) },
    from: (table: string) => {
      const query = { select: () => query, eq: () => query,
        single: async () => ({ data: { id: 'profile-1' }, error: null }),
        maybeSingle: async () => ({ data: table === 'seeker_profiles' ? { cv_url: state.currentCv } : null, error: null }),
        insert: (value: unknown) => { state.writes(value); return query },
        update: (value: unknown) => { state.writes(value); return query },
      }
      return query
    },
  } } }))
vi.mock('@/lib/rate-limit', () => ({ RateLimits: { profileWrite: {} }, enforceRateLimit: async () => state.limited ? NextResponse.json({ error: 'Try again later' }, { status: 429 }) : null }))
import { POST as authorize } from '@/app/api/cv-upload/route'
import { POST as save } from '@/app/api/profile/route'
const req = (body: unknown) => new NextRequest('https://joblink.test/api/cv-upload', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => {
  vi.clearAllMocks(); state.auth = 0; state.limited = false; state.currentCv = null
  state.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed' }, error: null })
  state.info.mockResolvedValue({ data: { size: MAX_CV_BYTES }, error: null })
})
it.each(['pdf', 'doc', 'docx', 'jpg', 'png', 'heic', 'heif'])('authorizes a 10 MB %s using an owned unique path and no overwrite', async extension => {
  const response = await authorize(req({ name: `cv.${extension}`, size: MAX_CV_BYTES, type: '' }))
  expect(response.status).toBe(200)
  const data = await response.json()
  expect(data.path).toMatch(new RegExp(`^user-1/cv-[a-f0-9-]+\\.${extension}$`))
  expect(state.sign).toHaveBeenCalledExactlyOnceWith(data.path)
})
it.each([401, 403])('requires verified authentication (%i)', async status => {
  state.auth = status
  expect((await authorize(req({ name: 'cv.pdf', size: 100 }))).status).toBe(status)
  expect(state.sign).not.toHaveBeenCalled()
})
it('rate limits authorization', async () => {
  state.limited = true
  expect((await authorize(req({ name: 'cv.pdf', size: 100 }))).status).toBe(429)
  expect(state.sign).not.toHaveBeenCalled()
})
it.each([{ name: 'cv.pdf', size: MAX_CV_BYTES + 1 }, { name: 'cv.exe', size: 100 }, { name: 'cv.pdf', size: 0 }, { name: 12, size: 100 }, null])('rejects bad metadata %j', async body => {
  expect((await authorize(req(body))).status).toBe(400)
  expect(state.sign).not.toHaveBeenCalled()
})
it('surfaces storage signing failures', async () => {
  state.sign.mockResolvedValue({ error: { message: 'RLS denied' }, data: null })
  const res = await authorize(req({ name: 'cv.pdf', size: 100 }))
  expect(res.status).toBe(503); expect((await res.json()).error).toMatch(/Sign in again/)
})
it.each(['pdf', 'docx', 'jpg', 'heic'])('records a verified stored %s with its real size', async ext => {
  const path = `user-1/cv-new.${ext}`
  const response = await save(req({ first_name: 'A', cv_url: path }))
  expect(response.status).toBe(200)
  expect(state.info).toHaveBeenCalledWith(path)
  expect(state.writes).toHaveBeenCalledWith(expect.objectContaining({ cv_url: path }))
})
it.each(['other/cv.pdf', 'user-1/../cv.pdf', 'user-1/cv.exe'])('rejects unsafe profile CV %s before storage access', async path => {
  expect((await save(req({ cv_url: path }))).status).toBe(400)
  expect(state.info).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled()
})
it('does not trust the declared upload size when saving', async () => {
  state.info.mockResolvedValue({ data: { size: MAX_CV_BYTES + 1 }, error: null })
  const response = await save(req({ cv_url: 'user-1/cv.pdf', size: 100 }))
  expect(response.status).toBe(400); expect((await response.json()).error).toMatch(/too large/)
  expect(state.writes).not.toHaveBeenCalled()
})
it('does not record missing or failed uploads', async () => {
  state.info.mockResolvedValue({ error: { message: 'not found' }, data: null })
  const response = await save(req({ cv_url: 'user-1/cv.pdf' }))
  expect(response.status).toBe(400); expect((await response.json()).error).toMatch(/could not be confirmed/)
  expect(state.writes).not.toHaveBeenCalled()
})
it('normalizes a legacy same-project URL before storing the owned path', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  try {
    const response = await save(req({ cv_url: 'https://project.supabase.co/storage/v1/object/public/cvs/user-1/cv.pdf' }))
    expect(response.status).toBe(200)
    expect(state.writes).toHaveBeenCalledWith(expect.objectContaining({ cv_url: 'user-1/cv.pdf' }))
  } finally { vi.unstubAllEnvs() }
})

it.each(['user-1/dangling.pdf', 'https://legacy.test/old-resume', 'legacy resume.pdf'])('allows unrelated edits with unchanged CV %s without storage verification', async path => {
  state.currentCv = path
  state.info.mockResolvedValue({ data: null, error: { message: 'not found' } })
  const response = await save(req({ profile_id: 'profile-1', cv_url: path, phone: '5551234' }))
  expect(response.status).toBe(200)
  expect(state.info).not.toHaveBeenCalled()
  expect(state.writes).toHaveBeenCalledWith(expect.objectContaining({ cv_url: path, phone: '5551234' }))
})
it.each([
  { data: null, error: null },
  { data: null, error: { code: 'NoSuchKey', message: 'Missing key' } },
  { data: null, error: { statusCode: '404', message: 'Missing key' } },
])('rejects a changed path positively reported missing: %j', async result => {
  state.currentCv = 'user-1/old.pdf'
  state.info.mockResolvedValue(result)
  const response = await save(req({ profile_id: 'profile-1', cv_url: 'user-1/new.pdf' }))
  expect(response.status).toBe(400)
  expect((await response.json()).error).toMatch(/could not be confirmed/)
  expect(state.writes).not.toHaveBeenCalled()
})
it.each(['returned', 'thrown'])('allows a changed CV when storage info errors (%s), logging context', async mode => {
  state.currentCv = 'user-1/old.pdf'
  const error = new Error('Storage service unavailable')
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    if (mode === 'thrown') state.info.mockRejectedValue(error)
    else state.info.mockResolvedValue({ data: null, error })
    expect((await save(req({ profile_id: 'profile-1', cv_url: 'user-1/new.pdf' }))).status).toBe(200)
    expect(state.writes).toHaveBeenCalledWith(expect.objectContaining({ cv_url: 'user-1/new.pdf' }))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('allowing save'), { userId: 'user-1', error })
  } finally { log.mockRestore() }
})
it('compares normalized legacy URLs with stored paths without checking storage', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  state.currentCv = 'user-1/cv.pdf'
  try {
    expect((await save(req({ cv_url: 'https://project.supabase.co/storage/v1/object/public/cvs/user-1/cv.pdf' }))).status).toBe(200)
    expect(state.info).not.toHaveBeenCalled()
  } finally { vi.unstubAllEnvs() }
})
