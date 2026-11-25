// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { FakeDb } from './helpers/fake-supabase'

const state = vi.hoisted(() => ({ db: null as unknown as import('./helpers/fake-supabase').FakeDb, emails: [] as { type: string; idempotencyKey?: string; data?: Record<string, unknown> }[], ended: [] as Record<string, unknown>[], user: { id: 'owner' } as { id: string } | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }))
vi.mock('@/lib/email', () => ({ BASE_URL: 'https://joblinkantigua.com', sendEmail: async (email: { type: string }) => { state.emails.push(email); return { success: true, id: 'e' } } }))
vi.mock('@/lib/messaging-notifications', () => ({ sendMessageNotification: async () => {} }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => null, RateLimits: { conversation: {} } }))
vi.mock('@/lib/api-auth', () => ({
  requireVerifiedUser: async () => (state.user ? { user: state.user, supabase: state.db, isAdmin: false } : { error: NextResponse.json({}, { status: 401 }) }),
}))
import { runSpotlightSchedule } from '@/lib/employer-billing/campaigns'
import { POST as invite } from '@/app/api/messages/invite/route'

const hour = 3_600_000
const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * hour).toISOString()

function seed(tables: Record<string, Record<string, unknown>[]> = {}) {
  const db = new FakeDb({
    companies: [{ id: 'co', user_id: 'owner', company_name: 'Treehouse', contact_email: 'hiring@treehouse.example', is_pro: false, pro_expires_at: null, is_confidential: false }],
    users: [{ id: 'owner', role: 'employer', email: 'boss@example.com', email_verified: true }, { id: 'seeker', role: 'seeker', email: 'sam@example.com' }, { id: 'hidden', role: 'seeker', email: 'h@example.com' }],
    seeker_profiles: [{ id: 'p1', user_id: 'seeker', visibility: 'actively_looking' }, { id: 'p2', user_id: 'hidden', visibility: 'not_looking' }],
    job_listings: [{ id: 'job-live', company_id: 'co', status: 'active', title: 'Line Cook' }, { id: 'job-closed', company_id: 'co', status: 'closed', title: 'Steward' }],
    applications: [], job_views: [], employer_pro_periods: [], employer_billing_settings: [{ directory_gated: true }],
    spotlight_campaigns: [], conversation_participants: [], conversations: [], messages: [],
    ...tables,
  })
  db.rpc = (async (name: string, args: Record<string, unknown>) => {
    if (name === 'end_spotlight_campaign') {
      state.ended.push(args)
      const row = db.tables.spotlight_campaigns.find((campaign) => campaign.id === args.p_campaign_id)
      if (row) Object.assign(row, { status: 'ended', ended_reason: args.p_reason })
    }
    return { data: { outcome: 'ended' }, error: null }
  }) as never
  state.db = db
  return db
}
const campaign = (id: string, overrides: Record<string, unknown>) => ({
  id, company_id: 'co', job_id: 'job-live', status: 'live', starts_at: iso(-100), ends_at: iso(68), ended_reason: null,
  report_sent_at: null, evidence_paths: [], ...overrides,
})

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('EMPLOYER_BILLING_ENABLED', 'true')
  Object.assign(state, { emails: [], ended: [], user: { id: 'owner' } })
})

describe('the Spotlight schedule', () => {
  it('ends a campaign at 168 hours, leaves a running one alone, and sends the results once', async () => {
    seed({ spotlight_campaigns: [campaign('due', { starts_at: iso(-168), ends_at: iso(-0.01) }), campaign('running', {})],
      applications: [{ id: 'a1', job_id: 'job-live', applied_at: iso(-50) }, { id: 'a0', job_id: 'job-live', applied_at: iso(-200) }] })
    const result = await runSpotlightSchedule(state.db as never)
    expect(result).toMatchObject({ ended: 1, closed_early: 0, reports: 1, failed: 0 })
    expect(state.ended).toEqual([{ p_campaign_id: 'due', p_reason: 'completed' }])
    expect(state.emails).toEqual([expect.objectContaining({ type: 'spotlight_report', idempotencyKey: 'spotlight/due/report' })])
    // Only applications during the window are counted.
    expect(state.emails[0].data).toMatchObject({ spotlight_applications: 1, spotlight_views: null })
    await runSpotlightSchedule(state.db as never)
    expect(state.emails).toHaveLength(1)
  })

  it('ends a campaign when its vacancy closes and tells the employer', async () => {
    seed({ spotlight_campaigns: [campaign('closed', { job_id: 'job-closed' })] })
    const result = await runSpotlightSchedule(state.db as never)
    expect(result.closed_early).toBe(1)
    expect(state.ended).toEqual([{ p_campaign_id: 'closed', p_reason: 'job_closed' }])
    expect(state.emails[0].type).toBe('spotlight_closed_early')
  })
})

describe('inviting candidates', () => {
  const send = (recipient: string) => invite(new Request('https://joblinkantigua.com/api/messages/invite', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_user_id: recipient, listing_id: 'job-live', body: 'Would you like to apply?' }),
  }) as never)

  it('is Pro only once the directory is restricted', async () => {
    seed()
    const response = await send('seeker')
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('PRO_REQUIRED')
    expect(state.db.tables.conversations).toHaveLength(0)
  })

  it('never reaches a candidate who chose not to be discoverable, even for Pro', async () => {
    seed({ employer_pro_periods: [{ company_id: 'co', period_start: iso(-24), period_end: iso(600), revoked_at: null }] })
    const response = await send('hidden')
    expect(response.status).toBe(404)
    expect(state.db.tables.conversations).toHaveLength(0)
  })

  it('works for every employer while the directory is open, as today', async () => {
    seed({ employer_billing_settings: [{ directory_gated: false }] })
    expect((await send('seeker')).status).not.toBe(403)
  })
})
