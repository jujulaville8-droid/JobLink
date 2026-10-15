import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), notify: vi.fn(), email: vi.fn(), rate: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ requireVerifiedUser: mocks.auth, requireUser: mocks.auth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/messaging-notifications', () => ({ sendMessageNotification: mocks.notify }))
vi.mock('@/lib/email', () => ({ sendEmail: mocks.email, BASE_URL: 'https://example.invalid' }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.rate, RateLimits: { message: {}, conversation: {} } }))
import { POST as send } from '@/app/api/messages/conversations/[id]/messages/route'
import { POST as conversation } from '@/app/api/messages/conversations/route'
import { POST as invite } from '@/app/api/messages/invite/route'

const sender = '11111111-1111-4111-8111-111111111111'
const peer = '22222222-2222-4222-8222-222222222222'
const thread = '33333333-3333-4333-8333-333333333333'
const messageId = '44444444-4444-4444-8444-444444444444'
const appId = '55555555-5555-4555-8555-555555555555'
type Result = { data: unknown; error?: unknown }
function client(queues: Record<string, Result[]>) {
  const writes: Array<{ table: string; data: unknown }> = []
  const from = vi.fn((table: string) => {
    const take = () => Promise.resolve(queues[table]?.shift() ?? { data: null, error: { code: 'UNEXPECTED_QUERY' } })
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'in', 'is', 'limit']) chain[method] = vi.fn(() => chain)
    chain.insert = vi.fn((data: unknown) => { writes.push({ table, data }); return chain })
    chain.single = vi.fn(take)
    chain.then = (yes: (value: Result) => unknown, no: (err: unknown) => unknown) => take().then(yes, no)
    return chain
  })
  return { from, writes, rpc: vi.fn().mockResolvedValue({ data: [{ seeker_user_id: peer, dialogue_open: true }] }) }
}
const request = (body: unknown) => new NextRequest('https://example.invalid/api/messages', { method: 'POST', body: JSON.stringify(body) })
const message = { id: messageId, conversation_id: thread, sender_id: sender, body: 'Hello' }
const app = { id: appId, seeker_id: peer, job_listings: { id: 'job', title: 'Cook', companies: { id: 'company', user_id: sender, company_name: 'Company' } }, seeker_profiles: { user_id: peer, first_name: 'Test', last_name: 'Person' } }

beforeEach(() => { vi.clearAllMocks(); mocks.rate.mockResolvedValue(null); mocks.notify.mockResolvedValue(undefined); mocks.email.mockResolvedValue(undefined) })

describe('persisted-message notification integration', () => {
  it('message route queries metadata only as the signed-in caller and passes persisted identity', async () => {
    const db = client({ conversation_participants: [{ data: { id: 'part', is_blocked: false } }], messages: [{ data: message }] })
    mocks.auth.mockResolvedValue({ user: { id: sender }, supabase: db })
    const response = await send(request({ body: ' Hello ', recipientId: 'attacker' }), { params: Promise.resolve({ id: thread }) })
    expect(response.status).toBe(201)
    expect(db.rpc).toHaveBeenCalledTimes(1)
    expect(db.rpc).toHaveBeenCalledWith('get_conversation_meta', { p_user_id: sender, p_conversation_id: thread })
    expect(mocks.notify).toHaveBeenCalledWith(db, { messageId, conversationId: thread, senderId: sender })
    expect(await response.json()).toEqual(message)
  })
  it('does not notify when message insertion fails', async () => {
    const db = client({ conversation_participants: [{ data: { id: 'part', is_blocked: false } }], messages: [{ data: null, error: { message: 'failure' } }] })
    mocks.auth.mockResolvedValue({ user: { id: sender }, supabase: db })
    expect((await send(request({ body: 'Hello' }), { params: Promise.resolve({ id: thread }) })).status).toBe(500)
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it('existing application conversation passes no recipient or display/body overrides', async () => {
    const db = client({ applications: [{ data: app }], conversations: [{ data: { id: thread } }], messages: [{ data: message }] })
    mocks.auth.mockResolvedValue({ user: { id: sender }, supabase: db })
    expect((await conversation(request({ application_id: appId, body: 'Hello' }))).status).toBe(200)
    expect(mocks.notify).toHaveBeenCalledWith(db, { messageId, conversationId: thread, senderId: sender })
  })
  it('new application conversation waits for a confirmed inserted message', async () => {
    const db = client({ applications: [{ data: app }], conversations: [{ data: null }] })
    const admin = client({ conversations: [{ data: { id: thread } }], conversation_participants: [{ data: null }], messages: [{ data: message }] })
    mocks.auth.mockResolvedValue({ user: { id: sender }, supabase: db }); mocks.admin.mockReturnValue(admin)
    expect((await conversation(request({ application_id: appId, body: 'Hello' }))).status).toBe(201)
    expect(mocks.notify).toHaveBeenCalledWith(db, { messageId, conversationId: thread, senderId: sender })
  })
  for (const existing of [true, false]) for (const failure of [true, false]) {
    it(`${existing ? 'existing' : 'new'} invitation ${failure ? 'rejects failed insert without email' : 'notifies only its confirmed message'}`, async () => {
      const db = client({ users: [{ data: { role: 'employer' } }, { data: { role: 'seeker' } }], companies: [{ data: { id: 'company', company_name: 'Company' } }], job_listings: [{ data: { title: 'Cook' } }] })
      const admin = client({ conversation_participants: existing ? [{ data: [{ conversation_id: thread }] }, { data: [{ conversation_id: thread }] }] : [{ data: [] }, { data: null }], conversations: [{ data: { id: thread } }], messages: [{ data: failure ? null : { id: messageId }, error: failure ? { message: 'no insert' } : null }] })
      mocks.auth.mockResolvedValue({ user: { id: sender }, supabase: db }); mocks.admin.mockReturnValue(admin)
      const response = await invite(request({ recipient_user_id: peer, listing_id: 'job', body: 'Hello' }))
      expect(response.status).toBe(failure ? 500 : 200)
      if (failure) { expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.email).not.toHaveBeenCalled() }
      else expect(mocks.notify).toHaveBeenCalledWith(db, { messageId, conversationId: thread, senderId: sender })
    })
  }
})
