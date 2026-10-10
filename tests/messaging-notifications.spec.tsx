// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({ createAdmin: vi.fn(), send: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdmin }))
vi.mock('@/lib/email', () => ({ sendEmail: mocks.send }))
import { sendMessageNotification } from '../src/lib/messaging-notifications'

type Row = Record<string, unknown>
type Query = { client: 'sender' | 'admin'; table: string; select?: string; filters: [string, string, unknown][]; limit?: number; insert?: Row }
const id = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`
const senderId = id('1'), recipientId = id('2'), conversationId = id('3'), messageId = id('4')
const applicationId = id('5'), seekerId = id('6'), jobId = id('7'), companyId = id('8'), outsiderId = id('9')
const params = { senderId, conversationId, messageId }
const now = new Date('2026-10-10T12:00:00Z')
let senderRows: Record<string, Row[]>
let adminRows: Record<string, Row[]>
let errors: Record<string, unknown>
let throwAt: string | null
let ignoreFilters: string | null
const queries: Query[] = []
const logs: Row[] = []
const senderRpc = vi.fn()

function client(kind: 'sender' | 'admin'): SupabaseClient {
  const rows = kind === 'sender' ? senderRows : adminRows
  return {
    rpc: senderRpc,
    from(table: string) {
      const query: Query = { client: kind, table, filters: [] }
      queries.push(query)
      const key = `${kind}:${table}`
      const execute = (single: boolean) => {
        if (throwAt === key) throw new Error('Private provider or query error: recipient@example.test and private body')
        if (errors[key]) return { data: null, error: errors[key] }
        if (query.insert) {
          if (kind !== 'admin' || table !== 'notification_log') throw new Error('Unexpected application write')
          logs.push(query.insert)
          return { data: null, error: null }
        }
        let result = (rows[table] || []).filter(record => ignoreFilters === key || query.filters.every(([op, field, value]) =>
          op === 'eq' ? record[field] === value : String(record[field]) > String(value)))
        if (query.limit) result = result.slice(0, query.limit)
        return single
          ? { data: result.length === 1 ? result[0] : null, error: result.length > 1 ? { code: 'PGRST116' } : null }
          : { data: result, error: null }
      }
      const chain = {
        select: (value: string) => { query.select = value; return chain },
        eq: (field: string, value: unknown) => { query.filters.push(['eq', field, value]); return chain },
        gt: (field: string, value: unknown) => { query.filters.push(['gt', field, value]); return chain },
        limit: (value: number) => { query.limit = value; return chain },
        insert: (value: Row) => { query.insert = value; return chain },
        single: async () => execute(true),
        maybeSingle: async () => execute(true),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute(false)).then(resolve),
      }
      return chain
    },
  } as unknown as SupabaseClient
}

function application() { return senderRows.applications[0] }
function seeker() { return application().seeker_profiles as Row }
function job() { return application().job_listings as Row }
function company() { return job().companies as Row }
function notify(extra: Record<string, unknown> = {}) {
  return sendMessageNotification(client('sender'), { ...params, ...extra })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.stubEnv('RESEND_API_KEY', 'test-only-no-external-traffic')
  queries.length = 0
  logs.length = 0
  errors = {}
  throwAt = ignoreFilters = null
  senderRows = {
    messages: [{ id: messageId, sender_id: senderId, conversation_id: conversationId, body: 'Saved body, never the request override. ' + 'x'.repeat(150) }],
    conversations: [{ id: conversationId, application_id: applicationId }],
    conversation_participants: [senderId, recipientId].map(user_id => ({ user_id, conversation_id: conversationId, is_blocked: false })),
    applications: [{ id: applicationId, seeker_id: seekerId, job_id: jobId,
      seeker_profiles: { id: seekerId, user_id: senderId },
      job_listings: { id: jobId, title: 'Saved job title', company_id: companyId, companies: { id: companyId, user_id: recipientId } },
    }],
    users: [{ id: senderId, is_banned: false }],
    companies: [],
    seeker_profiles: [{ user_id: senderId, first_name: 'Sender', last_name: 'Name' }],
  }
  adminRows = {
    users: [{ id: recipientId, email: 'recipient@example.test', is_banned: false }],
    user_messaging_settings: [{ user_id: recipientId, email_notifications: true, notification_cooldown_minutes: 5 }],
    notification_log: [],
  }
  mocks.createAdmin.mockImplementation(() => client('admin'))
  mocks.send.mockResolvedValue({ success: true, id: 'provider-accepted' })
  senderRpc.mockImplementation(() => { throw new Error('No cross-user RPC may be used') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('notifies only the persisted peer using saved message/context and exposes no notification data to callers', async () => {
  expect(await notify({ recipientId: outsiderId, senderName: 'Spoofed', jobTitle: 'Injected', messagePreview: 'Injected' })).toBeUndefined()
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
    to: 'recipient@example.test', type: 'new_message', idempotencyKey: `message/${messageId}/${recipientId}`,
    data: { sender_name: 'Sender Name', job_title: 'Saved job title', message_preview: String(senderRows.messages[0].body).slice(0, 100), conversation_url: `/messages/${conversationId}` },
  })
  expect(senderRpc).not.toHaveBeenCalled()
  expect(queries.find(q => q.table === 'messages')?.filters).toEqual([
    ['eq', 'id', messageId], ['eq', 'conversation_id', conversationId], ['eq', 'sender_id', senderId],
  ])
  expect(queries.filter(q => q.client === 'admin').map(q => q.table)).toEqual(['user_messaging_settings', 'notification_log', 'users', 'notification_log'])
  expect(queries.find(q => q.client === 'admin' && q.table === 'users')).toMatchObject({ select: 'id, email, is_banned', filters: [['eq', 'id', recipientId]] })
  expect(queries.find(q => q.client === 'sender' && q.table === 'seeker_profiles')?.filters).toEqual([['eq', 'user_id', senderId]])
  expect(logs).toEqual([{ user_id: recipientId, conversation_id: conversationId, channel: 'email', status: 'sent' }])
})

it('keeps company-first sender naming and works in the employer-to-seeker direction', async () => {
  seeker().user_id = recipientId
  company().user_id = senderId
  senderRows.companies = [{ user_id: senderId, company_name: 'Sender Company' }]
  await notify()
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sender_name: 'Sender Company' }) }))
  expect(queries.some(q => q.table === 'seeker_profiles')).toBe(false)
})

it('allows a two-person direct thread without inventing a listing context', async () => {
  senderRows.conversations[0].application_id = null
  await notify({ jobTitle: 'Arbitrary client listing' })
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ job_title: 'a position' }) }))
  expect(queries.some(q => q.table === 'applications')).toBe(false)
})

it('uses a neutral name when sender-owned company/profile names are absent', async () => {
  senderRows.seeker_profiles = []
  await notify()
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sender_name: 'Someone' }) }))
})

it.each(['messageId', 'conversationId', 'senderId'])('rejects malformed %s without database access', async field => {
  await notify({ [field]: '../malformed' })
  expect(queries).toEqual([])
  expect(mocks.createAdmin).not.toHaveBeenCalled()
})

it('skips all reads without an email-provider key', async () => {
  vi.stubEnv('RESEND_API_KEY', '')
  await notify()
  expect(queries).toEqual([])
  expect(mocks.send).not.toHaveBeenCalled()
})

const invalidContexts: [string, () => void][] = [
  ['uncommitted/missing message', () => { senderRows.messages = [] }],
  ['another sender message', () => { senderRows.messages[0].sender_id = outsiderId; ignoreFilters = 'sender:messages' }],
  ['another conversation message', () => { senderRows.messages[0].conversation_id = outsiderId; ignoreFilters = 'sender:messages' }],
  ['another message identity', () => { senderRows.messages[0].id = outsiderId; ignoreFilters = 'sender:messages' }],
  ['empty message body', () => { senderRows.messages[0].body = ' ' }],
  ['missing conversation', () => { senderRows.conversations = [] }],
  ['missing sender participant', () => { senderRows.conversation_participants[0].user_id = outsiderId }],
  ['missing peer participant', () => { senderRows.conversation_participants.pop() }],
  ['duplicate sender participants', () => { senderRows.conversation_participants[1].user_id = senderId }],
  ['extra participant', () => { senderRows.conversation_participants.push({ conversation_id: conversationId, user_id: outsiderId, is_blocked: false }) }],
  ['sender blocked in this thread', () => { senderRows.conversation_participants[0].is_blocked = true }],
  ['malformed peer block flag', () => { senderRows.conversation_participants[1].is_blocked = null }],
  ['wrong participant conversation', () => { senderRows.conversation_participants[1].conversation_id = outsiderId; ignoreFilters = 'sender:conversation_participants' }],
  ['missing application', () => { senderRows.applications = [] }],
  ['mismatched application seeker', () => { seeker().user_id = outsiderId }],
  ['mismatched application employer', () => { company().user_id = outsiderId }],
  ['mismatched seeker record', () => { seeker().id = outsiderId }],
  ['mismatched job record', () => { job().id = outsiderId }],
  ['mismatched company record', () => { company().id = outsiderId }],
  ['inaccessible application job', () => { application().job_listings = null }],
  ['ambiguous application join', () => { application().seeker_profiles = [seeker()] }],
  ['missing sender account', () => { senderRows.users = [] }],
  ['banned sender', () => { senderRows.users[0].is_banned = true }],
  ['wrong sender company', () => { senderRows.companies = [{ user_id: outsiderId, company_name: 'Wrong' }]; ignoreFilters = 'sender:companies' }],
  ['wrong sender profile', () => { senderRows.seeker_profiles[0].user_id = outsiderId; ignoreFilters = 'sender:seeker_profiles' }],
]

it.each(invalidContexts)('fails closed before private reads for %s', async (_description, change) => {
  change()
  await expect(notify()).resolves.toBeUndefined()
  expect(mocks.createAdmin).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
  expect(logs).toEqual([])
})

it('preserves directional blocking: the blocker can still send to their blocked peer', async () => {
  senderRows.conversation_participants[1].is_blocked = true
  await notify()
  expect(mocks.send).toHaveBeenCalledOnce()
})

it.each(['messages', 'conversations', 'conversation_participants', 'applications', 'users', 'companies', 'seeker_profiles'])('fails closed on sender-scoped %s read errors', async table => {
  errors[`sender:${table}`] = { code: 'denied' }
  await notify()
  expect(mocks.createAdmin).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})

describe('recipient preferences and cooldown', () => {
  it('honors opt-out without reading the private email address', async () => {
    adminRows.user_messaging_settings[0].email_notifications = false
    await notify()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(queries.some(q => q.client === 'admin' && q.table === 'users')).toBe(false)
    expect(logs[0]).toMatchObject({ status: 'skipped', user_id: recipientId })
  })

  it('uses enabled/five-minute defaults only for a successful absent settings row', async () => {
    adminRows.user_messaging_settings = []
    await notify()
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(queries.find(q => q.client === 'admin' && q.table === 'notification_log' && !q.insert)?.filters)
      .toContainEqual(['gt', 'created_at', '2026-10-10T11:55:00.000Z'])
  })

  it.each(['PGRST116', '42501', 'unavailable'])('never treats settings error %s as consent/defaults', async code => {
    errors['admin:user_messaging_settings'] = { code }
    await notify()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(queries.filter(q => q.client === 'admin').map(q => q.table)).toEqual(['user_messaging_settings'])
    expect(logs).toEqual([])
  })

  it.each([null, 'yes', 1])('rejects malformed email preference %s', async value => {
    adminRows.user_messaging_settings[0].email_notifications = value
    await notify()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it.each([null, 0, -1, 1.5, '5', Number.POSITIVE_INFINITY])('rejects malformed cooldown %s', async value => {
    adminRows.user_messaging_settings[0].notification_cooldown_minutes = value
    await notify()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('honors the saved recipient cooldown and logs a skip rather than reading recipient email', async () => {
    adminRows.user_messaging_settings[0].notification_cooldown_minutes = 20
    adminRows.notification_log = [{ id: 'recent', user_id: recipientId, conversation_id: conversationId, channel: 'email', status: 'sent', created_at: '2026-10-10T11:45:00Z' }]
    await notify()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(logs[0].status).toBe('skipped')
    expect(queries.some(q => q.client === 'admin' && q.table === 'users')).toBe(false)
    expect(queries.find(q => q.client === 'admin' && q.table === 'notification_log')?.filters).toEqual([
      ['eq', 'user_id', recipientId], ['eq', 'conversation_id', conversationId], ['eq', 'channel', 'email'],
      ['eq', 'status', 'sent'], ['gt', 'created_at', '2026-10-10T11:40:00.000Z'],
    ])
  })

  it('ignores unrelated/failed/expired notifications when applying the per-conversation cooldown', async () => {
    const base = { id: 'old', user_id: recipientId, conversation_id: conversationId, channel: 'email', status: 'sent', created_at: '2026-10-10T11:59:00Z' }
    adminRows.notification_log = [
      { ...base, user_id: outsiderId }, { ...base, conversation_id: outsiderId }, { ...base, status: 'failed' },
      { ...base, channel: 'sms' }, { ...base, created_at: '2026-10-10T11:50:00Z' },
    ]
    await notify()
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('fails closed on cooldown-read errors', async () => {
    errors['admin:notification_log'] = { code: 'unavailable' }
    await notify()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(queries.some(q => q.client === 'admin' && q.table === 'users')).toBe(false)
  })
})

it.each(['missing', 'banned', 'mismatched', 'error'])('skips the private recipient account when %s', async state => {
  if (state === 'missing') adminRows.users = []
  if (state === 'banned') adminRows.users[0].is_banned = true
  if (state === 'mismatched') { adminRows.users[0].id = outsiderId; ignoreFilters = 'admin:users' }
  if (state === 'error') errors['admin:users'] = { code: 'unavailable' }
  await notify()
  expect(mocks.send).not.toHaveBeenCalled()
  expect(logs).toEqual([])
})

it.each(['', null, 'one@example.test,two@example.test', 'one@example.test\r\nBcc: second@example.test', 'admin-company-123@joblinkantigua.com', 'import+company@joblinkantigua.com'])('rejects invalid/reserved saved recipient address %s', async address => {
  adminRows.users[0].email = address
  await notify()
  expect(mocks.send).not.toHaveBeenCalled()
})

it.each(['rejection', 'exception'])('records provider %s as failed, never as sent', async state => {
  if (state === 'rejection') mocks.send.mockResolvedValue({ success: false })
  else mocks.send.mockRejectedValue(new Error('Private recipient@example.test'))
  await expect(notify()).resolves.toBeUndefined()
  expect(logs).toEqual([{ user_id: recipientId, conversation_id: conversationId, channel: 'email', status: 'failed' }])
})

it('swallows admin/query exceptions without logging recipient/message details', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  throwAt = 'admin:user_messaging_settings'
  await expect(notify()).resolves.toBeUndefined()
  expect(warn).toHaveBeenCalledExactlyOnceWith('[sendMessageNotification] Notification unavailable')
  expect(mocks.send).not.toHaveBeenCalled()
  mocks.createAdmin.mockImplementation(() => { throw new Error('Private admin credentials') })
  await expect(notify()).resolves.toBeUndefined()
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(/recipient@example|private body|credentials/i)
})

it('does not retry email or claim failure after a successful provider result and failed audit insert', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.send.mockImplementation(async () => { throwAt = 'admin:notification_log'; return { success: true, id: 'accepted' } })
  await expect(notify()).resolves.toBeUndefined()
  expect(mocks.send).toHaveBeenCalledOnce()
  expect(queries.filter(q => q.insert).map(q => q.insert?.status)).toEqual(['sent'])
  expect(warn).toHaveBeenCalledWith('[sendMessageNotification] Notification log unavailable')
})
