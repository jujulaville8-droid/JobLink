// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const state = vi.hoisted(() => ({
  authStatus: null as number | null,
  rateStatus: null as number | null,
  role: 'seeker',
  profileMissing: false,
  jobMissing: false,
  insertError: null as { code: string; message: string; details?: string } | null,
  messagingError: null as string | null,
  job: {} as Record<string, unknown>,
  inserts: [] as Record<string, unknown>[],
  messagingInserts: [] as { table: string; payload: unknown }[],
  events: [] as string[],
  email: vi.fn(),
  notify: vi.fn(),
  afterCallbacks: [] as (() => Promise<void>)[],
  afterFailure: '' as '' | 'before' | 'after',
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const SEEKER_ID = '22222222-2222-4222-8222-222222222222'
const JOB_ID = '33333333-3333-4333-8333-333333333333'
const APPLICATION_ID = '44444444-4444-4444-8444-444444444444'
const COMPANY_ID = '55555555-5555-4555-8555-555555555555'
const OWNER_ID = '66666666-6666-4666-8666-666666666666'

function applicantDb() {
  return {
    from(table: string) {
      const filters: [string, unknown][] = []
      let payload: Record<string, unknown> | null = null
      const execute = () => {
        if (table === 'users') {
          return { data: filters.some(([key, value]) => key === 'id' && value === USER_ID) ? { role: state.role } : null, error: null }
        }
        if (table === 'seeker_profiles') {
          const ownProfile = filters.every(([key, value]) =>
            (key === 'user_id' && value === USER_ID) || (key === 'id' && value === SEEKER_ID))
          return { data: !state.profileMissing && ownProfile ? {
            id: SEEKER_ID, user_id: USER_ID, first_name: 'Test', last_name: 'Candidate',
            cv_url: `${USER_ID}/cv-saved.pdf`,
          } : null, error: null }
        }
        if (table === 'job_listings') {
          return { data: !state.jobMissing && filters.some(([key, value]) => key === 'id' && value === JOB_ID) ? state.job : null, error: null }
        }
        if (table === 'applications' && payload) {
          if (state.insertError) return { data: null, error: state.insertError }
          state.inserts.push(payload)
          state.events.push('application-saved')
          return { data: { ...payload, id: APPLICATION_ID, applied_at: '2026-10-05T12:00:00Z' }, error: null }
        }
        throw new Error(`Unexpected applicant database operation: ${table}`)
      }
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
        insert: (value: Record<string, unknown>) => { payload = value; return query },
        single: async () => execute(),
      }
      return query
    },
  }
}

function messagingDb() {
  return {
    from(table: string) {
      let payload: unknown
      const execute = () => {
        if (table === 'users') return { data: { id: 'admin-user' }, error: null }
        if (!['conversations', 'conversation_participants', 'messages'].includes(table)) {
          throw new Error(`Unexpected messaging operation: ${table}`)
        }
        state.messagingInserts.push({ table, payload })
        if (state.messagingError === table) {
          return { data: null, error: { message: 'Private cover letter', details: 'private-cv-folder/secret.pdf' } }
        }
        return { data: table === 'conversations' ? { id: 'conversation-id' } : null, error: null }
      }
      const query = {
        select: () => query,
        eq: () => query,
        limit: () => query,
        insert: (value: unknown) => { payload = value; return query },
        single: async () => execute(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      }
      return query
    },
  }
}

vi.mock('next/server', async importOriginal => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: (callback: () => Promise<void>) => {
    if (state.afterFailure === 'before') throw new Error('scheduler unavailable')
    state.afterCallbacks.push(callback)
    if (state.afterFailure === 'after') throw new Error('scheduler registration uncertain')
  },
}))

vi.mock('@/lib/api-auth', () => ({
  requireVerifiedUser: async () => state.authStatus
    ? { error: NextResponse.json({ error: 'Unavailable' }, { status: state.authStatus }) }
    : { user: { id: USER_ID, email: 'candidate@example.test', email_confirmed_at: '2026-01-01' }, supabase: applicantDb(), isAdmin: false },
}))
vi.mock('@/lib/rate-limit', () => ({
  RateLimits: { apply: {} },
  enforceRateLimit: async () => state.rateStatus ? NextResponse.json({ error: 'Rate limited' }, { status: state.rateStatus }) : null,
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => {
  if (state.messagingError === 'admin-client') throw new Error('private-cv-folder/secret.pdf')
  return messagingDb()
} }))
vi.mock('@/lib/email', () => ({ BASE_URL: 'https://joblinkantigua.com', sendEmail: state.email }))
vi.mock('@/lib/applicant-notifications', async importOriginal => ({ ...await importOriginal<object>(), notifyNewApplicant: state.notify }))

import { POST } from '@/app/api/jobs/apply/route'
import { SCREENING_NOTICE_VERSION } from '@/lib/employer-screening/notice'

const flushAfter = async () => { for (const callback of state.afterCallbacks.splice(0)) await callback() }
const apply = async (extra: Record<string, unknown> = {}, runAfter = true) => {
  const response = await POST(new NextRequest('https://joblinkantigua.com/api/jobs/apply', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: JOB_ID, cover_letter_text: 'I would like to apply.', ...extra }),
  }))
  // Model the real response boundary before running framework-managed callbacks.
  if (runAfter) await flushAfter()
  return response
}

beforeEach(() => {
  vi.clearAllMocks()
  state.authStatus = null
  state.rateStatus = null
  state.role = 'seeker'
  state.profileMissing = false
  state.jobMissing = false
  state.insertError = null
  state.messagingError = null
  state.inserts = []
  state.messagingInserts = []
  state.events = []
  state.afterCallbacks = []
  state.afterFailure = ''
  state.job = {
    id: JOB_ID, status: 'active', title: 'Test role', company_id: COMPANY_ID,
    posted_by_admin: true, expires_at: null,
    companies: { company_name: 'Test Company', user_id: OWNER_ID, contact_email: 'recruiter@example.test' },
  }
  state.email.mockResolvedValue({ success: true, id: 'confirmation-id' })
  state.notify.mockImplementation(async () => { state.events.push('notify'); return true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

it('passes only the current request notice to optional inline screening without changing the application insert', async () => {
  vi.stubEnv('EMPLOYER_SCREENING_INLINE_ENABLED', 'true')
  const response = await apply({ screening_notice_version: SCREENING_NOTICE_VERSION, screen: true })
  expect(response.status).toBe(201)
  expect(state.notify).toHaveBeenCalledExactlyOnceWith(APPLICATION_ID, USER_ID, SCREENING_NOTICE_VERSION)
  expect(state.inserts).toEqual([{ job_id: JOB_ID, seeker_id: SEEKER_ID, cover_letter_text: 'I would like to apply.', status: 'applied' }])
  expect(await response.json()).not.toHaveProperty('screening')
  expect(vi.mocked(console.info).mock.calls.some(call => String(call[1]).includes('route_notice_current'))).toBe(true)
})

it.each([undefined, 'old-notice', true])('never invents inline disclosure for stale/missing request attestation %s', async screening_notice_version => {
  vi.stubEnv('EMPLOYER_SCREENING_INLINE_ENABLED', 'true')
  expect((await apply({ screening_notice_version })).status).toBe(201)
  expect(state.notify).toHaveBeenCalledExactlyOnceWith(APPLICATION_ID, USER_ID)
  expect(vi.mocked(console.info).mock.calls.some(call => String(call[1]).includes('route_notice_missing'))).toBe(true)
})

it('notifies only after saving the authenticated seeker’s application', async () => {
  const response = await apply()
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ success: true, application: { id: APPLICATION_ID, seeker_id: SEEKER_ID, job_id: JOB_ID } })
  expect(state.inserts).toEqual([{ job_id: JOB_ID, seeker_id: SEEKER_ID, cover_letter_text: 'I would like to apply.', status: 'applied' }])
  expect(state.events).toEqual(['application-saved', 'notify'])
  expect(state.notify).toHaveBeenCalledExactlyOnceWith(APPLICATION_ID, USER_ID)
  expect(state.email).toHaveBeenCalledWith(expect.objectContaining({ to: 'candidate@example.test', type: 'application_confirmation' }))
})

it('ignores body-supplied recipients, CV paths, seeker IDs and application IDs', async () => {
  const response = await apply({
    to: 'attacker@example.test', contact_email: 'attacker@example.test', recipient: 'attacker@example.test',
    cv_url: `${OWNER_ID}/private.pdf`, applicant_user_id: OWNER_ID, seeker_id: 'other-seeker', application_id: 'forged-application',
  })
  expect(response.status).toBe(201)
  expect(state.notify).toHaveBeenCalledExactlyOnceWith(APPLICATION_ID, USER_ID)
  expect(state.inserts[0]).toEqual({ job_id: JOB_ID, seeker_id: SEEKER_ID, cover_letter_text: 'I would like to apply.', status: 'applied' })
  expect(state.email.mock.calls.every(([params]) => params.to === 'candidate@example.test')).toBe(true)
  const message = state.messagingInserts.find(value => value.table === 'messages')
  expect(message?.payload).toMatchObject({ sender_id: USER_ID, attachment_url: `${USER_ID}/cv-saved.pdf` })
})

it.each([401, 403])('does not save or notify when verified authentication returns %s', async status => {
  state.authStatus = status
  expect((await apply()).status).toBe(status)
  expect(state.inserts).toHaveLength(0)
  expect(state.notify).not.toHaveBeenCalled()
  expect(state.email).not.toHaveBeenCalled()
})

it('does not save or notify when rate limiting refuses the application', async () => {
  state.rateStatus = 429
  expect((await apply()).status).toBe(429)
  expect(state.inserts).toHaveLength(0)
  expect(state.notify).not.toHaveBeenCalled()
})

it.each(['employer', 'admin'])('does not save or notify for the %s role', async role => {
  state.role = role
  expect((await apply()).status).toBe(403)
  expect(state.inserts).toHaveLength(0)
  expect(state.notify).not.toHaveBeenCalled()
  expect(state.email).not.toHaveBeenCalled()
})

it('does not save or notify for the seeker’s own company listing', async () => {
  state.job.companies = [{ company_name: 'Own company', user_id: USER_ID, contact_email: 'owner@example.test' }]
  expect((await apply()).status).toBe(403)
  expect(state.inserts).toHaveLength(0)
  expect(state.notify).not.toHaveBeenCalled()
})

it.each(['closed', 'pending_approval', 'expired'])('does not notify for a %s listing', async status => {
  state.job.status = status
  state.job.expires_at = '2020-01-01T00:00:00Z'
  const originalJob = structuredClone(state.job)
  expect((await apply()).status).toBe(400)
  expect(state.job).toEqual(originalJob)
  expect(state.inserts).toHaveLength(0)
  expect(state.notify).not.toHaveBeenCalled()
})

it('does not notify when the seeker profile or listing cannot be found', async () => {
  state.profileMissing = true
  expect((await apply()).status).toBe(400)
  state.profileMissing = false
  state.jobMissing = true
  expect((await apply()).status).toBe(404)
  expect(state.inserts).toHaveLength(0)
  expect(state.notify).not.toHaveBeenCalled()
})

it.each([{ code: '23505', status: 409 }, { code: 'OTHER', status: 500 }])('does not send when application insert fails with $code', async ({ code, status }) => {
  state.insertError = { code, message: 'Insert refused' }
  expect((await apply()).status).toBe(status)
  expect(state.inserts).toHaveLength(0)
  expect(state.notify).not.toHaveBeenCalled()
  expect(state.email).not.toHaveBeenCalled()
  expect(state.messagingInserts).toHaveLength(0)
})

it('keeps the saved application successful when confirmation delivery is unavailable', async () => {
  state.email.mockResolvedValue({ success: false })
  expect((await apply()).status).toBe(201)
  expect(state.inserts).toHaveLength(1)
  expect(state.notify).toHaveBeenCalledExactlyOnceWith(APPLICATION_ID, USER_ID)
})

it('keeps the saved application successful when employer notification is unavailable', async () => {
  state.notify.mockResolvedValue(false)
  const response = await apply()
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ success: true, application: { id: APPLICATION_ID } })
  expect(state.inserts).toHaveLength(1)
})

function errorLogText() {
  return vi.mocked(console.error).mock.calls.flat().map(value => value instanceof Error ? value.message : JSON.stringify(value)).join(' ')
}

it('does not put failing application row details in logs', async () => {
  state.insertError = { code: 'OTHER', message: 'Private cover letter', details: 'private-cv-folder/secret.pdf' }
  expect((await apply()).status).toBe(500)
  expect(console.error).toHaveBeenCalled()
  expect(errorLogText()).not.toMatch(/Private cover letter|private-cv-folder/)
})

it.each(['conversations', 'conversation_participants', 'messages', 'admin-client'])('does not log private errors when %s fails', async table => {
  state.job.posted_by_admin = false
  state.messagingError = table
  expect((await apply()).status).toBe(201)
  expect(console.error).toHaveBeenCalled()
  expect(errorLogText()).not.toMatch(/Private cover letter|private-cv-folder/)
})

it('does not log private details from an unexpected provider exception', async () => {
  state.email.mockRejectedValue(new Error('private-cv-folder/secret.pdf'))
  expect((await apply()).status).toBe(500)
  expect(console.error).toHaveBeenCalled()
  expect(errorLogText()).not.toContain('private-cv-folder')
})

// A legacy date must not override the owner's explicit active status.
it('accepts an application for an active job with a past stored deadline without changing the job', async () => {
  state.job.expires_at = '2020-01-01T00:00:00Z'
  const originalJob = structuredClone(state.job)
  expect((await apply()).status).toBe(201)
  expect(state.inserts).toHaveLength(1)
  expect(state.inserts[0].job_id).toBe(JOB_ID)
  expect(state.job).toEqual(originalJob)
})


it('returns 201 with chat and applicant receipt complete before employer forwarding starts', async () => {
  const response = await apply({}, false)
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ conversation_id: 'conversation-id' })
  expect(state.messagingInserts.map(row => row.table)).toEqual(['conversations', 'conversation_participants', 'messages'])
  expect(state.email).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'application_confirmation' }))
  expect(state.notify).not.toHaveBeenCalled()
  expect(state.afterCallbacks).toHaveLength(1)
  let release!: () => void
  state.notify.mockImplementation(() => new Promise<boolean>(resolve => { release = () => resolve(true) }))
  const queued = state.afterCallbacks[0]
  const pending = queued()
  expect(state.notify).toHaveBeenCalledExactlyOnceWith(APPLICATION_ID, USER_ID)
  // A repeated callback cannot start a second employer send while one is pending.
  await queued()
  expect(state.notify).toHaveBeenCalledOnce()
  release()
  await pending
})

it('still awaits the original applicant receipt before scheduling employer forwarding', async () => {
  let release!: () => void
  state.email.mockImplementation(() => new Promise(resolve => { release = () => resolve({ success: true }) }))
  let returned = false
  const pending = apply({}, false).then(response => { returned = true; return response })
  await vi.waitFor(() => expect(state.email).toHaveBeenCalledOnce())
  expect(returned).toBe(false)
  expect(state.afterCallbacks).toHaveLength(0)
  expect(state.notify).not.toHaveBeenCalled()
  release()
  expect((await pending).status).toBe(201)
  expect(state.afterCallbacks).toHaveLength(1)
  await flushAfter()
})

it.each(['before', 'after'] as const)('falls back once when after registration fails %s registering', async failure => {
  state.afterFailure = failure
  const response = await apply({}, false)
  expect(response.status).toBe(201)
  expect(state.notify).toHaveBeenCalledExactlyOnceWith(APPLICATION_ID, USER_ID)
  await flushAfter()
  expect(state.notify).toHaveBeenCalledOnce()
})

it('contains deferred notifier errors without logging private details or retrying', async () => {
  state.notify.mockRejectedValue(new Error('private-cv-folder/secret.pdf'))
  expect((await apply({}, false)).status).toBe(201)
  const queued = state.afterCallbacks[0]
  await expect(queued()).resolves.toBeUndefined()
  await queued()
  expect(state.notify).toHaveBeenCalledOnce()
  expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).not.toContain('private-cv-folder')
})
