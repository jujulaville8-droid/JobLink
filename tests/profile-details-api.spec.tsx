// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({ writes: [] as { table: string; op: string; value: unknown; filters: [string, unknown][] }[], sensitiveError: null as unknown }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => null, RateLimits: { profileWrite: {} } }))
vi.mock('@/lib/api-auth', () => ({ requireVerifiedUser: async () => ({ user: { id: 'user-1', email: 'a@example.test', user_metadata: {} }, supabase: {
  from: (table: string) => {
    const write = { table, op: 'read', value: undefined as unknown, filters: [] as [string, unknown][] }
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { write.filters.push([column, value]); return query },
      single: async () => table === 'users' ? { data: { id: 'user-1' }, error: null } : { data: { id: 'new-profile' }, error: null },
      maybeSingle: async () => ({ data: null, error: null }),
      update: (value: unknown) => { Object.assign(write, { op: 'update', value }); state.writes.push(write); return query },
      insert: (value: unknown) => { Object.assign(write, { op: 'insert', value }); state.writes.push(write); return query },
      upsert: (value: unknown) => { Object.assign(write, { op: 'upsert', value }); state.writes.push(write); return query },
      delete: () => { Object.assign(write, { op: 'delete' }); state.writes.push(write); return query },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: table === 'seeker_sensitive_details' ? state.sensitiveError : null }).then(resolve),
    }
    return query
  },
} }) }))
import { POST } from '@/app/api/profile/route'

const send = (body: unknown) => POST(new NextRequest('https://joblinkantigua.com/api/profile', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))
const base = { profile_id: 'profile-1', first_name: 'Ada', last_name: 'L' }

beforeEach(() => { state.writes = []; state.sensitiveError = null })

describe('profile API optional details', () => {
  it('stores practical details on the profile and sensitive details only in the admin-only table', async () => {
    const response = await send({ ...base,
      details: { currently_employed: true, availability: ['weekends'], languages: ['English'] },
      sensitive: { marital_status: 'single', children_count: 1 } })
    expect(response.status).toBe(200)
    const profile = state.writes.find(write => write.table === 'seeker_profiles')!
    expect(profile.value).toMatchObject({ currently_employed: true, availability: ['weekends'], languages: ['English'] })
    expect(profile.value).not.toHaveProperty('marital_status')
    expect(profile.value).not.toHaveProperty('children_count')
    const sensitive = state.writes.find(write => write.table === 'seeker_sensitive_details')!
    expect(sensitive.op).toBe('upsert')
    expect(sensitive.value).toMatchObject({ seeker_id: 'profile-1', marital_status: 'single', children_count: 1 })
  })

  it('deletes the sensitive row when the seeker clears both answers', async () => {
    expect((await send({ ...base, sensitive: { marital_status: null, children_count: null } })).status).toBe(200)
    const sensitive = state.writes.find(write => write.table === 'seeker_sensitive_details')!
    expect(sensitive.op).toBe('delete')
    expect(sensitive.filters).toEqual([['seeker_id', 'profile-1']])
  })

  it('leaves existing details untouched when a caller omits them', async () => {
    expect((await send(base)).status).toBe(200)
    expect(state.writes.some(write => write.table === 'seeker_sensitive_details')).toBe(false)
    expect(state.writes.find(write => write.table === 'seeker_profiles')!.value).not.toHaveProperty('currently_employed')
  })

  it.each([
    [{ details: { availability: ['nights'] } }],
    [{ details: { marital_status: 'single' } }],
    [{ sensitive: { children_count: 99 } }],
  ])('rejects invalid input %j before any write', async extra => {
    expect((await send({ ...base, ...extra })).status).toBe(400)
    expect(state.writes).toEqual([])
  })

  it('reports a failed sensitive save instead of claiming success', async () => {
    state.sensitiveError = { code: '42501' }
    const response = await send({ ...base, sensitive: { marital_status: 'married', children_count: null } })
    expect(response.status).toBe(500)
  })
})
