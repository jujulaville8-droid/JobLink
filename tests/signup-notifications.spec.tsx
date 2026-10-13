// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { NextRequest, type NextFetchEvent } from 'next/server'

const boundary = vi.hoisted(() => ({ admin: null as unknown, user: null as unknown, queued: [] as (() => Promise<void>)[] }))
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: (work: () => Promise<void>) => boundary.queued.push(work) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => boundary.admin }))
vi.mock('@supabase/supabase-js', async original => ({ ...await original<typeof import('@supabase/supabase-js')>(), createClient: () => boundary.admin }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: boundary.user } }) },
  from: (table: string) => (boundary.admin as { from: (table: string) => unknown }).from(table),
}) }))
vi.mock('@/lib/api-auth', () => ({ requireUser: async () => ({ user: boundary.user, isAdmin: false }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { exchangeCodeForSession: async () => ({ error: null }), getUser: async () => ({ data: { user: boundary.user } }), updateUser: async () => ({ error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
}) }))
import { POST } from '@/app/api/auth/sync-verification/route'
import { GET } from '@/app/auth/callback/route'
import { proxy } from '@/proxy'

type Row = { id: string; role: string; email_verified: boolean; is_admin: boolean; is_banned: boolean; created_at: string }
let row: Row | null
let databaseFailure = false
let publish: ReturnType<typeof vi.fn>
const userId = '11111111-1111-4111-8111-111111111111'
const topic = 'TEST_ONLY_RANDOM_TOPIC_NEVER_PUBLISHED_0123456789'
const currentUser = () => boundary.user as User

// Boundary double models PostgREST's update filters and RETURNING rows. All
// notification eligibility, route handling, payloads and scheduling stay real.
class Query implements PromiseLike<unknown> {
  private operation = 'read'
  private fields: Record<string, unknown> = {}
  private filters = new Map<string, unknown>()
  constructor(private table: string) {}
  select() { return this }
  eq(key: string, value: unknown) { this.filters.set(key, value); return this }
  update(fields: Record<string, unknown>) { this.operation = 'update'; this.fields = fields; return this }
  insert(fields: Record<string, unknown>) { this.operation = 'insert'; this.fields = fields; return this }
  private run() {
    if (databaseFailure) return { data: null, error: { code: '08006', message: 'Synthetic database failure' } }
    if (this.table !== 'users') return { data: [], error: null }
    if (this.operation === 'insert') {
      if (row) return { data: null, error: { code: '23505', message: 'Synthetic duplicate' } }
      row = { is_admin: false, is_banned: false, created_at: '2026-10-13T10:00:00Z', ...this.fields } as Row
      return { data: [{ ...row }], error: null }
    }
    const matches = row && [...this.filters].every(([key, value]) => row![key as keyof Row] === value)
    if (!matches) return { data: [], error: null }
    if (this.operation === 'update') row = { ...row!, ...this.fields }
    return { data: [{ ...row! }], error: null }
  }
  async single() {
    const result = this.run()
    return { data: result.data?.[0] || null, error: result.error || (!result.data?.length ? { code: 'PGRST116' } : null) }
  }
  then<TResult1 = unknown, TResult2 = never>(onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}
const callback = () => GET(new NextRequest('https://joblinkantigua.com/auth/callback?code=SYNTHETIC&role=employer'))
const flush = async () => { for (const work of boundary.queued.splice(0)) await work() }

beforeEach(() => {
  boundary.queued = []
  databaseFailure = false
  row = { id: userId, role: 'seeker', email_verified: false, is_admin: false, is_banned: false, created_at: '2026-10-13T10:00:00Z' }
  boundary.user = { id: userId, aud: 'authenticated', email: 'SYNTHETIC_PRIVATE@example.test', created_at: '2026-10-13T10:00:00Z', email_confirmed_at: '2026-10-13T10:05:00Z', app_metadata: { provider: 'email' }, user_metadata: { role: 'seeker', name: 'PRIVATE_NAME_MUST_NOT_LEAVE' } } as User
  boundary.admin = { from: (table: string) => new Query(table) }
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://synthetic.example.invalid')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SYNTHETIC_NOT_A_KEY')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'SYNTHETIC_NOT_A_KEY')
  vi.stubEnv('NTFY_SIGNUP_ALERTS_ENABLED', 'true')
  vi.stubEnv('NTFY_SIGNUP_TOPIC', topic)
  vi.stubEnv('NTFY_SIGNUP_ALERTS_SINCE', '2026-10-13T09:00:00Z')
  publish = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'synthetic-message-id', event: 'message' }), { status: 200 }))
  vi.stubGlobal('fetch', publish)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('verified signup alerts', () => {
  it('verifies a password account before sending only a generic role alert after the response', async () => {
    const response = await POST()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ role: 'seeker', hasProfile: false })
    expect(row?.email_verified).toBe(true)
    expect(publish).not.toHaveBeenCalled()
    await flush()
    expect(publish).toHaveBeenCalledOnce()
    const [destination, request] = publish.mock.calls[0]
    expect(destination).toBe(`https://ntfy.sh/${topic}`)
    expect(request.body).toBe('1 new jobseeker account verified on JobLink.')
    const outgoing = JSON.stringify(request)
    for (const privateValue of [userId, currentUser().email!, 'PRIVATE_NAME_MUST_NOT_LEAVE']) expect(outgoing).not.toContain(privateValue)
    expect(request.redirect).toBe('error')
    expect(request.signal).toBeInstanceOf(AbortSignal)
  })
  it('notifies a newly verified Google employer and preserves the profile redirect', async () => {
    row!.role = 'employer'
    currentUser().app_metadata.provider = 'google'
    currentUser().user_metadata.role = 'employer'
    expect((await callback()).headers.get('location')).toBe('https://joblinkantigua.com/company-profile')
    await flush()
    expect(publish.mock.calls[0]?.[1].body).toBe('1 new employer account verified on JobLink.')
  })
  it('claims the first verification atomically across concurrent callbacks and repeated login', async () => {
    const responses = await Promise.all([POST(), POST(), callback(), callback(), POST()])
    expect(responses.every(response => response.status < 400)).toBe(true)
    await flush()
    expect(publish).toHaveBeenCalledOnce()
    await POST(); await callback(); await flush()
    expect(publish).toHaveBeenCalledOnce()
  })
  it.each(['admin', 'banned', 'placeholder', 'imported', 'historic', 'unverified', 'unknown-provider'])('does not alert for %s accounts', async condition => {
    if (condition === 'admin') row!.is_admin = true
    if (condition === 'banned') row!.is_banned = true
    if (condition === 'placeholder') { currentUser().email = 'admin-company-123@joblinkantigua.com'; currentUser().user_metadata.admin_created = true }
    if (condition === 'imported') currentUser().app_metadata.imported = true
    if (condition === 'historic') currentUser().created_at = '2026-09-01T00:00:00Z'
    if (condition === 'unverified') delete currentUser().email_confirmed_at
    if (condition === 'unknown-provider') currentUser().app_metadata.provider = 'other'
    await POST(); await flush()
    expect(publish).not.toHaveBeenCalled()
  })
  it('does not re-notify an already verified account', async () => {
    row!.email_verified = true
    await POST(); await callback(); await flush()
    expect(publish).not.toHaveBeenCalled()
  })
  it('alerts when protected-page verification repair wins before the callback', async () => {
    const background: Promise<unknown>[] = []
    const event = { waitUntil: (work: Promise<unknown>) => background.push(work) } as unknown as NextFetchEvent
    const response = await proxy(new NextRequest('https://joblinkantigua.com/dashboard'), event)
    expect(response.status).toBe(200)
    expect(row?.email_verified).toBe(true)
    await Promise.all(background)
    await POST(); await callback(); await flush()
    expect(publish).toHaveBeenCalledOnce()
    expect(publish.mock.calls[0][1].body).toBe('1 new jobseeker account verified on JobLink.')
  })
  it('deduplicates racing protected-page repair and verification callbacks', async () => {
    const background: Promise<unknown>[] = []
    const event = { waitUntil: (work: Promise<unknown>) => background.push(work) } as unknown as NextFetchEvent
    await Promise.all([proxy(new NextRequest('https://joblinkantigua.com/dashboard'), event), POST(), callback()])
    await Promise.all(background); await flush()
    expect(publish).toHaveBeenCalledOnce()
  })
  it('deduplicates concurrent fresh public-account recovery', async () => {
    row = null
    const responses = await Promise.all([POST(), POST(), callback()])
    expect(responses.every(response => response.status < 400)).toBe(true)
    await flush()
    expect(publish).toHaveBeenCalledOnce()
  })
  it.each(['disabled', 'missing-topic', 'short-topic', 'topic-url', 'missing-cutoff', 'preview'])('keeps verification working with %s configuration and no publication', async config => {
    if (config === 'disabled') vi.stubEnv('NTFY_SIGNUP_ALERTS_ENABLED', 'false')
    if (config === 'missing-topic') vi.stubEnv('NTFY_SIGNUP_TOPIC', '')
    if (config === 'short-topic') vi.stubEnv('NTFY_SIGNUP_TOPIC', 'JobLink')
    if (config === 'topic-url') vi.stubEnv('NTFY_SIGNUP_TOPIC', 'https://evil.example/secret')
    if (config === 'missing-cutoff') vi.stubEnv('NTFY_SIGNUP_ALERTS_SINCE', '')
    if (config === 'preview') vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await POST()).status).toBe(200)
    expect(row?.email_verified).toBe(true)
    await flush()
    expect(publish).not.toHaveBeenCalled()
  })
  it.each([429, 403, 500])('does not break verification or retry an ntfy %s response', async status => {
    publish.mockResolvedValue(new Response('Synthetic rejection', { status }))
    expect((await POST()).status).toBe(200)
    await flush(); await POST(); await flush()
    expect(publish).toHaveBeenCalledOnce()
  })
  it('contains a network failure without exposing the topic or applicant details in logs', async () => {
    publish.mockRejectedValue(new Error(`Network error ${topic} ${currentUser().email}`))
    expect((await POST()).status).toBe(200)
    await flush()
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(logs).not.toContain(topic)
    expect(logs).not.toContain(currentUser().email!)
    await POST(); await flush()
    expect(publish).toHaveBeenCalledOnce()
  })
  it('does not claim publication when the provider returns an invalid acknowledgement', async () => {
    publish.mockResolvedValue(new Response('{}', { status: 200 }))
    await POST(); await flush()
    expect(console.error).toHaveBeenCalledWith('[signup-alert] Provider acknowledgement unavailable; delivery uncertain')
  })
  it('recovers a fresh missing public account once and does not alert historic backfills', async () => {
    row = null
    expect((await POST()).status).toBe(200)
    await flush()
    expect(publish).toHaveBeenCalledOnce()
    row = null
    currentUser().created_at = '2026-09-01T00:00:00Z'
    await POST(); await flush()
    expect(publish).toHaveBeenCalledOnce()
  })
  it('fails verification on database errors without sending or recreating an existing account', async () => {
    databaseFailure = true
    expect((await POST()).status).toBe(500)
    expect(row?.email_verified).toBe(false)
    await flush()
    expect(publish).not.toHaveBeenCalled()
  })
})
