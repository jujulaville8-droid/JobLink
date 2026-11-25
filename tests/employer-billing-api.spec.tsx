// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { FakeDb } from './helpers/fake-supabase'

const state = vi.hoisted(() => ({
  db: null as unknown as import('./helpers/fake-supabase').FakeDb,
  user: { id: 'owner', email: 'boss@example.com', email_confirmed_at: '2026-01-01' } as Record<string, unknown> | null,
  admin: false,
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  rpcError: null as null | { message: string },
  emails: [] as { type: string }[],
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }))
vi.mock('@/lib/email', () => ({ BASE_URL: 'https://joblinkantigua.com', sendEmail: async (email: { type: string }) => { state.emails.push(email); return { success: true, id: 'e' } } }))
vi.mock('@/lib/verification/server', () => ({ ownerAlert: async () => {} }))
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => null, RateLimits: { checkout: {} } }))
vi.mock('@/lib/api-auth', () => {
  const denied = (status: number) => ({ error: NextResponse.json({ error: 'no' }, { status }) })
  return {
    requireVerifiedUser: async () => (state.user ? { user: state.user, supabase: state.db, isAdmin: state.admin } : denied(401)),
    requireAdmin: async () => (!state.user ? denied(401) : state.admin ? { user: state.user, supabase: state.db, isAdmin: true } : denied(403)),
  }
})

import { POST as start } from '@/app/api/employer/billing/start/route'
import { POST as claim } from '@/app/api/employer/billing/claim/route'
import { POST as redeem } from '@/app/api/employer/billing/redeem/route'
import { GET as adminQueue, POST as adminAct } from '@/app/api/admin/employer-billing/route'

const ORIGIN = 'https://joblinkantigua.com'
const JOB = '0b0f6a0e-1111-4222-8333-444455556666'
const OTHER_JOB = '0b0f6a0e-2222-4222-8333-444455556666'
const CREDIT = '0b0f6a0e-3333-4222-8333-444455556666'
const ORDER = '0b0f6a0e-4444-4222-8333-444455556666'
const CAMPAIGN = '0b0f6a0e-5555-4222-8333-444455556666'
const COMPANY = '0b0f6a0e-6666-4222-8333-444455556666'
const post = (url: string, body: unknown, origin = ORIGIN) =>
  new Request(`${ORIGIN}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin, host: 'joblinkantigua.com', 'x-forwarded-proto': 'https' }, body: JSON.stringify(body) })

function seed() {
  const db = new FakeDb({
    users: [{ id: 'owner', role: 'employer' }, { id: 'seeker', role: 'seeker' }, { id: 'admin', role: 'seeker', is_admin: true }],
    companies: [{ id: COMPANY, user_id: 'owner', company_name: 'Treehouse', is_pro: false, pro_expires_at: null }],
    job_listings: [{ id: JOB, company_id: COMPANY, status: 'active', title: 'Line Cook' }, { id: OTHER_JOB, company_id: 'someone-else', status: 'active' }],
    employer_orders: [], employer_pro_subscriptions: [], employer_pro_periods: [], spotlight_campaigns: [], spotlight_credits: [],
    employer_billing_settings: [{ id: true, directory_gated: false }],
  })
  db.rpc = (async (name: string, args: Record<string, unknown>) => {
    state.rpc.push({ name, args })
    return state.rpcError ? { data: null, error: state.rpcError } : { data: { campaignId: CAMPAIGN }, error: null }
  }) as never
  state.db = db
  return db
}

beforeEach(() => {
  vi.unstubAllEnvs()
  for (const [key, value] of Object.entries({
    EMPLOYER_BILLING_ENABLED: 'true', EMPLOYER_BILLING_LIVEMODE: 'true',
    EMPLOYER_SPOTLIGHT_PRICE_ID: 'price_spot', EMPLOYER_PRO_PRICE_ID: 'price_pro',
    EMPLOYER_SPOTLIGHT_LINK_URL: 'https://buy.stripe.com/spot125', EMPLOYER_PRO_LINK_URL: 'https://buy.stripe.com/pro200',
  })) vi.stubEnv(key, value)
  Object.assign(state, { user: { id: 'owner', email: 'boss@example.com', email_confirmed_at: '2026-01-01' }, admin: false, rpc: [], rpcError: null, emails: [] })
  seed()
})

describe('starting a purchase', () => {
  it('records an order for this company and sends the buyer to the issued link with its reference', async () => {
    const response = await start(post('/api/employer/billing/start', { offer: 'spotlight', job_id: JOB }))
    expect(response.status).toBe(200)
    const { url } = await response.json()
    const order = state.db.tables.employer_orders[0]
    expect(order).toMatchObject({ offer: 'spotlight', company_id: COMPANY, purchaser_id: 'owner', job_id: JOB, livemode: true })
    const link = new URL(url)
    expect(link.origin + link.pathname).toBe('https://buy.stripe.com/spot125')
    expect(link.searchParams.get('prefilled_email')).toBe('boss@example.com')
    expect(link.searchParams.has('client_reference_id')).toBe(true)
  })

  it('only for a live vacancy the company owns, and not twice for one already booked', async () => {
    expect((await start(post('/api/employer/billing/start', { offer: 'spotlight', job_id: OTHER_JOB }))).status).toBe(409)
    state.db.tables.spotlight_campaigns.push({ job_id: JOB, status: 'live' })
    const booked = await start(post('/api/employer/billing/start', { offer: 'spotlight', job_id: JOB }))
    expect((await booked.json()).code).toBe('SPOTLIGHT_BOOKED')
    expect(state.db.tables.employer_orders).toHaveLength(0)
  })

  it('refuses a second Pro subscription', async () => {
    state.db.tables.employer_pro_subscriptions.push({ company_id: COMPANY, status: 'active', stripe_subscription_id: 'sub_1' })
    const response = await start(post('/api/employer/billing/start', { offer: 'pro' }))
    expect((await response.json()).code).toBe('ALREADY_PRO')
  })

  it('is closed while switched off or not configured, and to job seekers and other sites', async () => {
    vi.stubEnv('EMPLOYER_PRO_LINK_URL', '')
    expect((await start(post('/api/employer/billing/start', { offer: 'pro' }))).status).toBe(404)
    vi.stubEnv('EMPLOYER_PRO_LINK_URL', 'https://buy.stripe.com/pro200')
    expect((await start(post('/api/employer/billing/start', { offer: 'pro' }, 'https://evil.example'))).status).toBe(400)
    state.user = { id: 'seeker', email: 's@example.com' }
    expect((await start(post('/api/employer/billing/start', { offer: 'pro' }))).status).toBe(403)
  })
})

describe('claiming a direct-link payment', () => {
  it('only an unassigned paid order whose receipt email is this verified account', async () => {
    state.db.tables.employer_orders.push(
      { id: ORDER, company_id: null, status: 'paid', customer_email: 'BOSS@example.com', offer: 'spotlight' },
      { id: 'someone-elses', company_id: null, status: 'paid', customer_email: 'other@example.com', offer: 'spotlight' },
    )
    expect((await claim(post('/api/employer/billing/claim', { order_id: '0b0f6a0e-9999-4222-8333-444455556666' }))).status).toBe(404)
    expect((await claim(post('/api/employer/billing/claim', { order_id: ORDER }))).status).toBe(200)
    expect(state.rpc).toEqual([{ name: 'assign_employer_order', args: { p_order_id: ORDER, p_company_id: COMPANY, p_actor_id: 'owner' } }])
  })

  it('not for an unverified email', async () => {
    state.user = { id: 'owner', email: 'boss@example.com', email_confirmed_at: null }
    state.db.tables.employer_orders.push({ id: ORDER, company_id: null, status: 'paid', customer_email: 'boss@example.com' })
    expect((await claim(post('/api/employer/billing/claim', { order_id: ORDER }))).status).toBe(403)
  })
})

describe('booking a Spotlight with a credit', () => {
  it('spends the credit through the locked database step', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const response = await redeem(post('/api/employer/billing/redeem', { credit_id: CREDIT, job_id: JOB, requested_start: today }))
    expect(response.status).toBe(200)
    expect(state.rpc[0]).toEqual({ name: 'redeem_spotlight_credit', args: expect.objectContaining({ p_credit_id: CREDIT, p_company_id: COMPANY, p_job_id: JOB }) })
  })

  it('explains a refusal in plain words and never books a date in the past', async () => {
    state.rpcError = { message: 'credit_expired' }
    const response = await redeem(post('/api/employer/billing/redeem', { credit_id: CREDIT, job_id: JOB, requested_start: '2099-01-01' }))
    expect(await response.json()).toEqual({ error: 'That Spotlight expired at the end of its paid month.' })
    expect((await redeem(post('/api/employer/billing/redeem', { credit_id: CREDIT, job_id: JOB, requested_start: '2020-01-01' }))).status).toBe(400)
  })
})

describe('the admin queue', () => {
  it('is admin only', async () => {
    expect((await adminQueue(new Request(`${ORIGIN}/api/admin/employer-billing`))).status).toBe(403)
    expect((await adminAct(post('/api/admin/employer-billing', { action: 'grant_credit', company_id: COMPANY }))).status).toBe(403)
    expect(state.db.tables.spotlight_credits).toHaveLength(0)
  })

  it('restricting the directory needs explicit confirmation that employers were told', async () => {
    state.user = { id: 'admin' }; state.admin = true
    expect((await adminAct(post('/api/admin/employer-billing', { action: 'set_directory_gate', gated: true }))).status).toBe(400)
    expect(state.db.tables.employer_billing_settings[0].directory_gated).toBe(false)
    expect((await adminAct(post('/api/admin/employer-billing', { action: 'set_directory_gate', gated: true, confirm: 'NOTICE SENT' }))).status).toBe(200)
    expect(state.db.tables.employer_billing_settings[0]).toMatchObject({ directory_gated: true, gated_by: 'admin' })
  })

  it('grants a manual Spotlight attributed to the admin', async () => {
    state.user = { id: 'admin' }; state.admin = true
    await adminAct(post('/api/admin/employer-billing', { action: 'grant_credit', company_id: COMPANY }))
    expect(state.db.tables.spotlight_credits[0]).toMatchObject({ company_id: COMPANY, source: 'manual', granted_by: 'admin' })
  })

  it('proof links must be https, and proof is only emailed for a live campaign with all three', async () => {
    state.user = { id: 'admin' }; state.admin = true
    state.db.tables.spotlight_campaigns.push({ id: CAMPAIGN, status: 'live', company_id: COMPANY, job_id: JOB, website_url: 'https://joblinkantigua.com/jobs/x', facebook_url: null, instagram_url: null, evidence_paths: [], ends_at: '2026-12-01T00:00:00Z' })
    expect((await adminAct(post('/api/admin/employer-billing', { action: 'save_proof', campaign_id: CAMPAIGN, facebook_url: 'javascript:alert(1)' }))).status).toBe(400)
    expect((await adminAct(post('/api/admin/employer-billing', { action: 'send_proof', campaign_id: CAMPAIGN }))).status).toBe(400)
    await adminAct(post('/api/admin/employer-billing', { action: 'save_proof', campaign_id: CAMPAIGN, facebook_url: 'https://facebook.com/p/1', instagram_url: 'https://instagram.com/p/1' }))
    state.db.tables.companies[0].contact_email = 'hiring@treehouse.example'
    expect((await adminAct(post('/api/admin/employer-billing', { action: 'send_proof', campaign_id: CAMPAIGN }))).status).toBe(200)
    expect(state.emails).toEqual([expect.objectContaining({ type: 'spotlight_live' })])
  })

  it('allows the one included edit only once', async () => {
    state.user = { id: 'admin' }; state.admin = true
    state.db.tables.spotlight_campaigns.push({ id: CAMPAIGN, status: 'live', edit_used_at: null })
    expect((await adminAct(post('/api/admin/employer-billing', { action: 'mark_edit', campaign_id: CAMPAIGN }))).status).toBe(200)
    expect((await adminAct(post('/api/admin/employer-billing', { action: 'mark_edit', campaign_id: CAMPAIGN }))).status).toBe(409)
  })

  it('an unassigned payment cannot be dismissed, only assigned', async () => {
    state.user = { id: 'admin' }; state.admin = true
    state.db.tables.employer_orders.push({ id: ORDER, company_id: null, needs_review: true })
    expect((await adminAct(post('/api/admin/employer-billing', { action: 'resolve_review', order_id: ORDER }))).status).toBe(409)
    expect(state.db.tables.employer_orders[0].needs_review).toBe(true)
  })
})
