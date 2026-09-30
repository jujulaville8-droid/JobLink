// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const mocks = vi.hoisted(() => ({ adminAuth: vi.fn(), userAuth: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ requireAdmin: mocks.adminAuth, requireVerifiedUser: mocks.userAuth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
import { POST as issue } from '@/app/api/admin/company-claims/route'
import { POST as claim } from '@/app/api/claim/[token]/route'
const token = 'T'.repeat(43)
const company = '00000000-0000-4000-8000-000000000001'
beforeEach(() => { vi.clearAllMocks(); mocks.adminAuth.mockResolvedValue({ user: { id: 'admin' } }); mocks.userAuth.mockResolvedValue({ user: { id: 'verified-employer' } }) })
const claimRequest = (origin = 'https://joblinkantigua.com') => new Request(`https://joblinkantigua.com/api/claim/${token}`, { method: 'POST', headers: { origin }, body: JSON.stringify({ user_id: 'attacker-supplied-id' }) })
it('requires server-validated admin authentication before issuing anything', async () => {
  mocks.adminAuth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
  expect((await issue(new Request('https://joblinkantigua.com/api/admin/company-claims', { method: 'POST' }))).status).toBe(403)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('rejects malformed JSON, IDs and extra user-controlled fields', async () => {
  for (const body of ['broken', JSON.stringify({ company_id: 'invalid' }), JSON.stringify({ company_id: company, created_by: 'someone-else' })]) {
    expect((await issue(new Request('https://joblinkantigua.com/api/admin/company-claims', { method: 'POST', body }))).status).toBe(400)
  }
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('generates independent 32-byte URL-safe tokens and uses the authenticated admin', async () => {
  mocks.rpc.mockResolvedValue({ data: { expires_at: '2026-10-30' }, error: null })
  const links = []
  for (let i = 0; i < 2; i++) {
    const response = await issue(new Request('https://joblinkantigua.com/api/admin/company-claims', { method: 'POST', body: JSON.stringify({ company_id: company }) }))
    expect(response.headers.get('cache-control')).toBe('no-store')
    links.push((await response.json()).url)
  }
  expect(links[0]).not.toBe(links[1])
  for (const [, args] of mocks.rpc.mock.calls) {
    expect(args.p_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(args.p_token, 'base64url')).toHaveLength(32)
    expect(args.p_admin_id).toBe('admin')
  }
})
it('handles a company that is no longer placeholder-owned', async () => {
  mocks.rpc.mockResolvedValue({ error: { message: 'COMPANY_NOT_CLAIMABLE' } })
  expect((await issue(new Request('https://joblinkantigua.com/api/admin/company-claims', { method: 'POST', body: JSON.stringify({ company_id: company }) }))).status).toBe(409)
})
it('requires a verified session and refuses a cross-origin claim', async () => {
  mocks.userAuth.mockResolvedValueOnce({ error: NextResponse.json({}, { status: 401 }) })
  expect((await claim(claimRequest(), { params: Promise.resolve({ token }) })).status).toBe(401)
  expect((await claim(claimRequest('https://evil.example'), { params: Promise.resolve({ token }) })).status).toBe(403)
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('uses only the session user ID in a single transactional RPC', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ company_id: company }], error: null })
  const response = await claim(claimRequest(), { params: Promise.resolve({ token }) })
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('claim_company', { p_token: token, p_user_id: 'verified-employer' })
  expect(await response.json()).toEqual({ redirectTo: `/dashboard?claimed=${company}` })
})
it('returns friendly expiry, role and ownership conflicts without leaking database details', async () => {
  for (const [message, status] of [['CLAIM_UNAVAILABLE', 410], ['EMPLOYER_REQUIRED', 403], ['EMAIL_UNVERIFIED', 403], ['COMPANY_ALREADY_OWNED', 409], ['internal secret detail', 500]] as const) {
    mocks.rpc.mockResolvedValue({ error: { message } })
    const response = await claim(claimRequest(), { params: Promise.resolve({ token }) })
    expect(response.status).toBe(status)
    expect((await response.json()).error).not.toContain('internal secret detail')
  }
})
it('accepts the original Host when Next uses an internal request hostname', async () => {
  mocks.rpc.mockResolvedValue({ data: [{ company_id: company }], error: null })
  const request = new Request(`http://localhost:3141/api/claim/${token}`, { method: 'POST', headers: { origin: 'http://127.0.0.1:3141', host: '127.0.0.1:3141' } })
  expect((await claim(request, { params: Promise.resolve({ token }) })).status).toBe(200)
})
it('refuses malformed and null browser origins', async () => {
  for (const origin of ['null', 'not a url', 'https://joblinkantigua.com/path']) {
    expect((await claim(claimRequest(origin), { params: Promise.resolve({ token }) })).status).toBe(403)
  }
  expect(mocks.rpc).not.toHaveBeenCalled()
})
