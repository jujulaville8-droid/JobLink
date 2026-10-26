import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { notifyApplicantsOfJobClosure, selectClosureSuggestions } from '@/lib/job-closure-notifications'

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>, send: vi.fn(), createAdmin: vi.fn(),
  missingLog: false, logWriteError: false, readError: '',
}))
vi.mock('@/lib/email', () => ({ sendEmail: state.send }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: state.createAdmin }))

function db() {
  return { from: (table: string) => {
    const filters: ((row: Row) => boolean)[] = []
    let bounds = [0, 999], insert: Row | undefined, update: Row | undefined
    const run = () => {
      if (table === state.readError || (table === 'job_closure_notification_log' && state.missingLog)) {
        return { data: null, error: { code: '42P01', message: 'unavailable private@example.com' } }
      }
      if (insert) {
        if (state.tables[table].some(row => row.job_id === insert!.job_id && row.user_id === insert!.user_id)) {
          return { data: null, error: { code: '23505' } }
        }
        state.tables[table].push({ status: 'claimed', ...insert })
      }
      const rows = state.tables[table].filter(row => filters.every(fn => fn(row)))
      if (update) {
        if (state.logWriteError) return { data: null, error: { message: 'unavailable' } }
        rows.forEach(row => Object.assign(row, update))
      }
      return { data: rows.slice(bounds[0], bounds[1] + 1), error: null }
    }
    const query = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query },
      range: (start: number, end: number) => { bounds = [start, end]; return query },
      insert: (row: Row) => { insert = row; return query },
      update: (row: Row) => { update = row; return query },
      single: async () => { const result = run(); return { ...result, data: result.data?.[0] } },
      maybeSingle: async () => { const result = run(); return { ...result, data: result.data?.[0] } },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    }
    return query
  } }
}

const job = (id: string, fields = {}) => ({ id, title: id, category: 'Hospitality', job_type: 'full_time', status: 'active',
  created_at: '2026-10-01', location: 'St. John’s', companies: { company_name: 'Island Hotel' }, ...fields })
const application = (id: string, user_id: string) => ({ id, job_id: 'closed', seeker_profiles: { user_id, first_name: 'Maya' } })

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'local-test-only')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  state.missingLog = false; state.logWriteError = false; state.readError = ''
  state.send.mockReset().mockResolvedValue({ success: true, id: 'message-id' })
  state.createAdmin.mockReset().mockImplementation(db)
  state.tables = {
    job_listings: [job('closed', { status: 'closed' }), job('suggested')],
    applications: [application('a', 'user')],
    users: [{ id: 'user', email: 'maya@example.com' }], job_closure_notification_log: [],
  }
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('dedupes by user, resolves first names, and skips missing profiles, users and email addresses', async () => {
  state.tables.applications.push(application('b', 'user'), application('c', 'no-email'), application('d', 'missing'),
    { id: 'e', job_id: 'closed', seeker_profiles: null },
    { id: 'f', job_id: 'closed', seeker_profiles: [{ user_id: 'other', first_name: 'Jo' }] })
  state.tables.users.push({ id: 'no-email', email: ' ' }, { id: 'other', email: 'jo@example.com' })
  expect(await notifyApplicantsOfJobClosure('closed')).toEqual({ sent: 2, failed: 0 })
  expect(state.send.mock.calls.map(([mail]) => mail.to)).toEqual(['maya@example.com', 'jo@example.com'])
  expect(state.send).toHaveBeenCalledWith(expect.objectContaining({
    type: 'job_closed_applicant', idempotencyKey: 'job-closed/closed/user',
    data: { applicant_name: 'Maya', job_title: 'closed', company_name: 'Island Hotel', suggested_jobs: [
      { title: 'suggested', company: 'Island Hotel', location: 'St. John’s', url: 'https://joblinkantigua.com/jobs/suggested' },
    ] },
  }))
  expect(state.tables.job_closure_notification_log).toHaveLength(2)
})

it('orders category before job type before recency and excludes all unavailable roles', () => {
  const candidates = [
    job('unrelated-new', { category: 'Retail', job_type: 'part_time', created_at: '2026-10-26' }),
    job('type-only', { category: 'Retail', created_at: '2026-10-25' }),
    job('category-only', { job_type: 'part_time', created_at: '2026-01-01' }),
    job('both-old', { created_at: '2026-02-01' }), job('both-new', { created_at: '2026-03-01' }),
    job('closed'), job('inactive', { status: 'closed' }), job('pending', { status: 'pending_approval' }),
    job('e03a2b8c-f69b-42bb-bc43-13a5d0917291', { created_at: '2026-10-27' }),
  ]
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T12:00:00Z'))
  try {
    expect(selectClosureSuggestions(job('closed'), candidates).map(row => row.id))
      .toEqual(['both-new', 'both-old', 'category-only', 'type-only'])
  } finally { vi.useRealTimers() }
})

it('does not treat missing category or type as a similarity match', () => {
  expect(selectClosureSuggestions(job('closed', { category: null, job_type: null }), [
    job('old', { category: null, job_type: null }), job('new', { created_at: '2026-10-26' }),
  ]).map(row => row.id)).toEqual(['new', 'old'])
})

it('paginates every application and the full suggestion pool before choosing four', async () => {
  state.tables.applications = Array.from({ length: 501 }, (_, i) => application(`${i}`, i === 500 ? 'last' : 'user'))
  state.tables.users.push({ id: 'last', email: 'last@example.com' })
  state.tables.job_listings = [job('closed', { status: 'closed' }),
    ...Array.from({ length: 501 }, (_, i) => job(`${i}`, { category: i === 500 ? 'Hospitality' : 'Retail' })),
  ]
  expect(await notifyApplicantsOfJobClosure('closed')).toEqual({ sent: 2, failed: 0 })
  expect(state.send.mock.calls[0][0].data.suggested_jobs[0].title).toBe('500')
})

it('uses durable claims across repeated and concurrent invocations', async () => {
  await Promise.all([notifyApplicantsOfJobClosure('closed'), notifyApplicantsOfJobClosure('closed')])
  await notifyApplicantsOfJobClosure('closed')
  expect(state.send).toHaveBeenCalledTimes(1)
  expect(state.tables.job_closure_notification_log).toEqual([
    expect.objectContaining({ job_id: 'closed', user_id: 'user', status: 'sent', message_id: 'message-id' }),
  ])
})

it.each(['rejected', 'thrown'])('isolates a %s send and retains its claim even if acceptance is uncertain', async failure => {
  state.tables.applications.push(application('b', 'other'))
  state.tables.users.push({ id: 'other', email: 'other@example.com' })
  if (failure === 'rejected') state.send.mockResolvedValueOnce({ success: false })
  else state.send.mockRejectedValueOnce(new Error('private@example.com'))
  expect(await notifyApplicantsOfJobClosure('closed')).toEqual({ sent: 1, failed: 1 })
  await notifyApplicantsOfJobClosure('closed')
  expect(state.send).toHaveBeenCalledTimes(2)
  expect(state.send.mock.calls[1][0].to).toBe('other@example.com')
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private@example.com')
})

it('retains the claim if saving provider acceptance fails', async () => {
  state.logWriteError = true
  await notifyApplicantsOfJobClosure('closed')
  await notifyApplicantsOfJobClosure('closed')
  expect(state.send).toHaveBeenCalledTimes(1)
  expect(state.tables.job_closure_notification_log[0].status).toBe('claimed')
})

it('skips all delivery when the migration is absent', async () => {
  state.missingLog = true
  expect(await notifyApplicantsOfJobClosure('closed')).toEqual({ sent: 0, failed: 1 })
  expect(state.send).not.toHaveBeenCalled()
})

it.each(['applications', 'users', 'job_listings'])('handles an unavailable %s read without sending or leaking details', async table => {
  state.readError = table
  expect(await notifyApplicantsOfJobClosure('closed')).toEqual({ sent: 0, failed: 1 })
  expect(state.send).not.toHaveBeenCalled()
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private@example.com')
})

it.each(['active', 'pending_approval'])('does not send when the current job status is %s', async status => {
  state.tables.job_listings[0].status = status
  await notifyApplicantsOfJobClosure('closed')
  expect(state.send).not.toHaveBeenCalled()
})

it('sends a useful update with an empty suggestions array when no open jobs exist', async () => {
  state.tables.job_listings.pop()
  await notifyApplicantsOfJobClosure('closed')
  expect(state.send.mock.calls[0][0].data.suggested_jobs).toEqual([])
})

it('does not read private records or claim delivery without a provider key', async () => {
  vi.stubEnv('RESEND_API_KEY', '')
  expect(await notifyApplicantsOfJobClosure('closed')).toEqual({ sent: 0, failed: 0 })
  expect(state.createAdmin).not.toHaveBeenCalled()
})
