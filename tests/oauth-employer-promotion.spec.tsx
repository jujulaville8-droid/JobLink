// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

type UserRow = { id: string; role: string; email_verified: boolean; is_admin: boolean; is_banned: boolean; created_at: string }
const db = vi.hoisted(() => ({
  users: [] as Record<string, unknown>[], seeker_profiles: [] as Record<string, unknown>[], companies: [] as Record<string, unknown>[],
  failTable: null as string | null, updates: [] as Record<string, unknown>[],
}))
const boundary = vi.hoisted(() => ({ user: null as unknown, updateUser: vi.fn(async () => ({ error: null })) }))

// Minimal PostgREST double: equality filters, limit, single, update/insert with RETURNING.
class Query implements PromiseLike<unknown> {
  private operation = 'read'
  private fields: Record<string, unknown> = {}
  private filters: [string, unknown][] = []
  constructor(private table: keyof typeof db) {}
  select() { return this }
  limit() { return this }
  eq(key: string, value: unknown) { this.filters.push([key, value]); return this }
  update(fields: Record<string, unknown>) { this.operation = 'update'; this.fields = fields; return this }
  insert(fields: Record<string, unknown>) { this.operation = 'insert'; this.fields = fields; return this }
  private run() {
    if (db.failTable === this.table) return { data: null, error: { code: '08006', message: 'Synthetic failure' } }
    const rows = db[this.table] as Record<string, unknown>[]
    if (this.operation === 'insert') {
      if (rows.some(row => row.id === this.fields.id)) return { data: null, error: { code: '23505', message: 'dup' } }
      const row = { is_admin: false, is_banned: false, created_at: new Date().toISOString(), ...this.fields }
      rows.push(row); return { data: [{ ...row }], error: null }
    }
    const matches = rows.filter(row => this.filters.every(([key, value]) => row[key] === value))
    if (this.operation === 'update') {
      db.updates.push({ table: this.table, ...this.fields })
      for (const row of matches) Object.assign(row, this.fields)
    }
    return { data: matches.map(row => ({ ...row })), error: null }
  }
  async single() {
    const result = this.run()
    return { data: result.data?.[0] ?? null, error: result.error ?? (result.data?.length ? null : { code: 'PGRST116' }) }
  }
  then<A = unknown, B = never>(ok?: ((value: unknown) => A | PromiseLike<A>) | null, fail?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, fail)
  }
}
const admin = { from: (table: keyof typeof db) => new Query(table) }

vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: () => {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { exchangeCodeForSession: async () => ({ error: null }), getUser: async () => ({ data: { user: boundary.user } }), updateUser: boundary.updateUser },
  from: (table: keyof typeof db) => new Query(table),
}) }))

import { GET } from '@/app/auth/callback/route'
import { promoteNewOAuthEmployer, NEW_OAUTH_ACCOUNT_WINDOW_MS } from '@/lib/promote-oauth-employer'

const userId = '22222222-2222-4222-8222-222222222222'
const nowIso = () => new Date().toISOString()
const user = () => boundary.user as User
const row = () => db.users[0] as UserRow
const callback = (query: string) => GET(new NextRequest(`https://joblinkantigua.com/auth/callback?code=SYNTHETIC${query}`))
const claimPath = '/claim/' + 'a'.repeat(43)

beforeEach(() => {
  // Exactly what the signup trigger leaves for a new Google account: a seeker row.
  db.users = [{ id: userId, email: 'new.google@example.test', role: 'seeker', email_verified: false, is_admin: false, is_banned: false, created_at: nowIso() }]
  db.seeker_profiles = []; db.companies = []; db.failTable = null; db.updates = []
  boundary.updateUser.mockClear()
  boundary.user = {
    id: userId, aud: 'authenticated', email: 'new.google@example.test', created_at: nowIso(), email_confirmed_at: nowIso(),
    app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { email_verified: true, full_name: 'New Person' },
    identities: [{ provider: 'google' }],
  } as unknown as User
  vi.stubEnv('NTFY_SIGNUP_ALERTS_ENABLED', 'false')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Google sign-in from employer login', () => {
  it('makes a brand-new Google account an employer and keeps metadata in line', async () => {
    const response = await callback('&role=employer')
    expect(response.headers.get('location')).toBe('https://joblinkantigua.com/company-profile')
    expect(row().role).toBe('employer')
    expect(row().email_verified).toBe(true)
    expect(boundary.updateUser).toHaveBeenCalledWith({ data: { role: 'employer' } })
  })

  it('keeps the claim destination for a brand-new Google employer', async () => {
    const response = await callback(`&role=employer&returnTo=${encodeURIComponent(claimPath)}`)
    expect(response.headers.get('location')).toBe(`https://joblinkantigua.com${claimPath}`)
    expect(row().role).toBe('employer')
  })

  it('leaves the seeker Google path (no role) unchanged', async () => {
    const response = await callback('')
    expect(row().role).toBe('seeker')
    expect(response.headers.get('location')).toBe('https://joblinkantigua.com/profile')
    expect(boundary.updateUser).toHaveBeenCalledWith({ data: { role: 'seeker' } })
    expect(db.updates.some(update => 'role' in update)).toBe(false)
  })

  it('leaves role=seeker Google signups unchanged', async () => {
    await callback('&role=seeker')
    expect(row().role).toBe('seeker')
  })

  it.each([
    ['an existing seeker profile', () => { db.seeker_profiles.push({ id: 'p', user_id: userId }) }],
    ['an owned company', () => { db.companies.push({ id: 'c', user_id: userId }) }],
    ['an admin flag', () => { row().is_admin = true }],
    ['an admin role', () => { row().role = 'admin' }],
    ['a ban', () => { row().is_banned = true }],
    ['an account older than the window', () => { user().created_at = new Date(Date.now() - NEW_OAUTH_ACCOUNT_WINDOW_MS - 1000).toISOString() }],
    ['an email-password account', () => { user().app_metadata.provider = 'email'; user().app_metadata.providers = ['email'] }],
    ['a linked email identity', () => { user().app_metadata.providers = ['email', 'google'] }],
    ['a linked identity list', () => { (user() as unknown as { identities: { provider: string }[] }).identities = [{ provider: 'email' }, { provider: 'google' }] }],
    ['a failed profile lookup', () => { db.failTable = 'seeker_profiles' }],
    ['a failed company lookup', () => { db.failTable = 'companies' }],
  ])('never changes an account with %s', async (_label, arrange) => {
    arrange()
    const before = row().role
    await callback('&role=employer')
    expect(row().role).toBe(before)
    expect(db.updates.some(update => update.role === 'employer')).toBe(false)
  })

  it('creates an employer row when the signup trigger left none', async () => {
    db.users = []
    await callback('&role=employer')
    expect(db.users[0]).toMatchObject({ id: userId, role: 'employer', email_verified: true })
  })

  it('is idempotent on a repeated employer login', async () => {
    await callback('&role=employer')
    await callback('&role=employer')
    expect(row().role).toBe('employer')
    expect(db.updates.filter(update => update.role === 'employer')).toHaveLength(1)
  })
})

describe('promoteNewOAuthEmployer compare-and-set', () => {
  it('does not promote when the row changed after it was read', async () => {
    const racing = { from: (table: keyof typeof db) => {
      const query = new Query(table)
      if (table === 'users') {
        const original = query.update.bind(query)
        query.update = (fields: Record<string, unknown>) => { row().role = 'admin'; return original(fields) }
      }
      return query
    } } as unknown as SupabaseClient
    expect(await promoteNewOAuthEmployer(racing, user())).toBe(false)
    expect(row().role).toBe('admin')
  })

  it('rejects a created_at in the future', async () => {
    user().created_at = new Date(Date.now() + 5 * 60_000).toISOString()
    expect(await promoteNewOAuthEmployer(admin as unknown as SupabaseClient, user())).toBe(false)
  })
})
