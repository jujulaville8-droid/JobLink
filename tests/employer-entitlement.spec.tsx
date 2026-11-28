// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb } from './helpers/fake-supabase'

vi.mock('server-only', () => ({}))
import { companyEntitlement, directoryAccess, directoryGated } from '@/lib/employer-billing/entitlement'

const day = 86_400_000
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString()
const db = (tables: Record<string, Record<string, unknown>[]>) => new FakeDb({
  companies: [{ id: 'free', is_pro: false, pro_expires_at: null }, { id: 'grant', is_pro: true, pro_expires_at: null },
    { id: 'expired-grant', is_pro: true, pro_expires_at: at(-1) }, { id: 'paid', is_pro: false, pro_expires_at: null }],
  employer_pro_periods: [], employer_billing_settings: [{ directory_gated: false }],
  ...tables,
}) as never

beforeEach(() => { vi.unstubAllEnvs() })

describe('one Pro check', () => {
  it('while employer pricing is off, keeps today\'s rule: the company flag and its expiry', async () => {
    const store = db({ employer_pro_periods: [{ company_id: 'paid', period_start: at(-1), period_end: at(29), revoked_at: null }] })
    expect((await companyEntitlement(store, 'grant')).pro).toBe(true)
    expect((await companyEntitlement(store, 'expired-grant')).pro).toBe(false)
    expect((await companyEntitlement(store, 'paid')).pro).toBe(false)
  })

  it('with pricing on, a settled month gives Pro until its end, plus one day of allowance for the renewal', async () => {
    vi.stubEnv('EMPLOYER_BILLING_ENABLED', 'true')
    const end = at(10)
    const store = db({ employer_pro_periods: [{ company_id: 'paid', period_start: at(-20), period_end: end, revoked_at: null }] })
    expect(await companyEntitlement(store, 'paid')).toEqual({ pro: true, source: 'paid', paidThrough: end })
    const lapsed = db({ employer_pro_periods: [{ company_id: 'paid', period_start: at(-32), period_end: at(-2), revoked_at: null }] })
    expect((await companyEntitlement(lapsed, 'paid')).pro).toBe(false)
    const renewing = db({ employer_pro_periods: [{ company_id: 'paid', period_start: at(-30), period_end: at(-0.5), revoked_at: null }] })
    expect((await companyEntitlement(renewing, 'paid')).pro).toBe(true)
  })

  it('a refunded month gives nothing, and a month that has not started yet gives nothing', async () => {
    vi.stubEnv('EMPLOYER_BILLING_ENABLED', 'true')
    expect((await companyEntitlement(db({ employer_pro_periods: [{ company_id: 'paid', period_start: at(-1), period_end: at(29), revoked_at: at(0) }] }), 'paid')).pro).toBe(false)
    expect((await companyEntitlement(db({ employer_pro_periods: [{ company_id: 'paid', period_start: at(3), period_end: at(33), revoked_at: null }] }), 'paid')).pro).toBe(false)
  })

  it('a manual or complimentary grant keeps Pro access under the new rules', async () => {
    vi.stubEnv('EMPLOYER_BILLING_ENABLED', 'true')
    expect(await companyEntitlement(db({}), 'grant')).toEqual({ pro: true, source: 'grant', paidThrough: null })
  })

  it('fails closed on an error or an unknown company', async () => {
    vi.stubEnv('EMPLOYER_BILLING_ENABLED', 'true')
    const broken = new FakeDb({ companies: [] })
    broken.failures['companies.select'] = { code: 'XX000', message: 'down' }
    expect((await companyEntitlement(broken as never, 'grant')).pro).toBe(false)
    expect((await companyEntitlement(db({}), null)).pro).toBe(false)
  })
})

describe('the directory gate', () => {
  it('is open to everyone while pricing is off, even if the database switch is on', async () => {
    const store = db({ employer_billing_settings: [{ directory_gated: true }] })
    expect(await directoryGated(store)).toBe(false)
    expect(await directoryAccess(store, 'free')).toBe(true)
  })

  it('is open to everyone with pricing on until the gate is switched on', async () => {
    vi.stubEnv('EMPLOYER_BILLING_ENABLED', 'true')
    expect(await directoryAccess(db({}), 'free')).toBe(true)
  })

  it('once gated: Pro and admins only', async () => {
    vi.stubEnv('EMPLOYER_BILLING_ENABLED', 'true')
    const store = db({ employer_billing_settings: [{ directory_gated: true }] })
    expect(await directoryAccess(store, 'free')).toBe(false)
    expect(await directoryAccess(store, 'grant')).toBe(true)
    expect(await directoryAccess(store, null, true)).toBe(true)
  })
})
