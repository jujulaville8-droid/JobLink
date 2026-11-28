// @vitest-environment node
/**
 * Routing and validation in the employer pricing webhook branch. The database
 * functions it calls are tested against Postgres in employer-billing-db.test.mjs;
 * here the database is a recorder, so these tests pin down which events are
 * ours, what is refused before anything is written, and which call is made.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ alerts: [] as string[] }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/verification/server', () => ({ ownerAlert: async (title: string) => { state.alerts.push(title) } }))
import { handleEmployerBillingEvent } from '@/lib/employer-billing/webhook'

const SPOT_PRICE = 'price_spot125', PRO_PRICE = 'price_pro200'
const SPOT_LINK = 'plink_spot', PRO_LINK = 'plink_pro'

function recorder(options: { knownSubscription?: boolean; order?: boolean; period?: boolean; rpcResult?: Record<string, unknown> } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const query = (table: string) => {
    const chain = {
      select: () => chain, eq: () => chain, update: () => chain, insert: async () => ({ error: null }),
      maybeSingle: async () => ({
        data: table === 'employer_pro_subscriptions' ? (options.knownSubscription ? { stripe_subscription_id: 'sub_1' } : null)
          : table === 'employer_orders' ? (options.order ? { id: 'o1' } : null)
          : table === 'employer_pro_periods' ? (options.period ? { id: 'p1' } : null) : null,
        error: null,
      }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }
    return chain
  }
  const db = {
    calls,
    from: query,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: name === 'claim_employer_billing_event' ? true : options.rpcResult ?? { outcome: 'applied' }, error: null }
    },
  }
  return db
}
const stripe = (prices: string[]) => ({
  checkout: { sessions: { listLineItems: async () => ({ data: prices.map((id) => ({ price: { id } })) }) } },
  invoices: { retrieve: async () => ({ payments: { data: [{ status: 'paid', payment: { payment_intent: 'pi_invoice' } }] } }) },
}) as never
const event = (type: string, object: Record<string, unknown>, livemode = true) => ({ id: `evt_${type}`, type, livemode, data: { object } }) as never
const session = (overrides: Record<string, unknown> = {}) => ({
  id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: 12500, currency: 'xcd', payment_link: SPOT_LINK,
  client_reference_id: '0b0f6a0e-1111-4222-8333-444455556666', payment_intent: 'pi_1', customer: 'cus_1',
  customer_details: { email: 'boss@example.com' }, metadata: {}, ...overrides,
})
const names = (db: ReturnType<typeof recorder>) => db.calls.map((call) => call.name)

beforeEach(() => {
  vi.unstubAllEnvs()
  for (const [key, value] of Object.entries({
    EMPLOYER_BILLING_ENABLED: 'true', EMPLOYER_BILLING_LIVEMODE: 'true',
    EMPLOYER_SPOTLIGHT_PRICE_ID: SPOT_PRICE, EMPLOYER_PRO_PRICE_ID: PRO_PRICE,
    EMPLOYER_SPOTLIGHT_LINK_ID: SPOT_LINK, EMPLOYER_PRO_LINK_ID: PRO_LINK,
    EMPLOYER_SPOTLIGHT_LINK_URL: 'https://buy.stripe.com/spot', EMPLOYER_PRO_LINK_URL: 'https://buy.stripe.com/pro',
  })) vi.stubEnv(key, value)
  state.alerts = []
})

describe('switches', () => {
  it('does nothing while employer pricing is off or not fully configured', async () => {
    vi.stubEnv('EMPLOYER_BILLING_ENABLED', 'false')
    const db = recorder()
    expect(await handleEmployerBillingEvent(stripe([SPOT_PRICE]), db as never, event('checkout.session.completed', session()))).toEqual({ handled: false })
    vi.stubEnv('EMPLOYER_BILLING_ENABLED', 'true')
    vi.stubEnv('EMPLOYER_PRO_PRICE_ID', '')
    expect(await handleEmployerBillingEvent(stripe([SPOT_PRICE]), db as never, event('checkout.session.completed', session()))).toEqual({ handled: false })
    expect(db.calls).toHaveLength(0)
  })

  it('ignores a sandbox event in live mode, and the reverse', async () => {
    const db = recorder()
    expect(await handleEmployerBillingEvent(stripe([SPOT_PRICE]), db as never, event('checkout.session.completed', session(), false))).toEqual({ handled: false })
    expect(db.calls).toHaveLength(0)
  })
})

describe('Spotlight checkout', () => {
  it('records a settled payment once, with the reference and amount Stripe signed', async () => {
    const db = recorder()
    const result = await handleEmployerBillingEvent(stripe([SPOT_PRICE]), db as never, event('checkout.session.completed', session()))
    expect(result).toEqual({ handled: true, outcome: 'applied' })
    expect(db.calls).toEqual([{ name: 'record_spotlight_payment', args: expect.objectContaining({
      p_session_id: 'cs_1', p_reference: '0b0f6a0e-1111-4222-8333-444455556666', p_amount: 12500, p_currency: 'xcd', p_payment_intent: 'pi_1', p_livemode: true,
    }) }])
  })

  it('waits for funds on a delayed payment, then records it on async success', async () => {
    const db = recorder()
    expect(await handleEmployerBillingEvent(stripe([SPOT_PRICE]), db as never, event('checkout.session.completed', session({ payment_status: 'unpaid' }))))
      .toEqual({ handled: true, outcome: 'awaiting_funds' })
    expect(names(db)).toEqual(['claim_employer_billing_event'])
    await handleEmployerBillingEvent(stripe([SPOT_PRICE]), db as never, event('checkout.session.async_payment_succeeded', session()))
    expect(names(db)).toContain('record_spotlight_payment')
  })

  it('refuses a wrong amount or currency without granting anything', async () => {
    for (const overrides of [{ amount_total: 100 }, { currency: 'usd' }]) {
      const db = recorder()
      expect(await handleEmployerBillingEvent(stripe([SPOT_PRICE]), db as never, event('checkout.session.completed', session(overrides))))
        .toEqual({ handled: true, outcome: 'amount_mismatch' })
      expect(names(db)).not.toContain('record_spotlight_payment')
    }
    expect(state.alerts).toHaveLength(2)
  })

  it('does not trust the link alone: a session from our link with another price is flagged', async () => {
    const db = recorder()
    expect(await handleEmployerBillingEvent(stripe(['price_something_else']), db as never, event('checkout.session.completed', session())))
      .toEqual({ handled: true, outcome: 'price_mismatch' })
    expect(names(db)).not.toContain('record_spotlight_payment')
  })

  it('leaves Verified, Smart Resume, legacy Pro and other links to their own branches', async () => {
    const db = recorder()
    for (const object of [
      session({ payment_link: null, metadata: { purchase_type: 'seeker_verification' } }),
      session({ payment_link: 'plink_unrelated' }),
      session({ payment_link: null, metadata: { user_id: 'u1' } }),
    ]) {
      expect(await handleEmployerBillingEvent(stripe(['price_legacy']), db as never, event('checkout.session.completed', object))).toEqual({ handled: false })
    }
    expect(db.calls).toHaveLength(0)
  })

  it('alerts the owner when a payment arrives without a reference', async () => {
    const db = recorder({ rpcResult: { outcome: 'unassigned' } })
    await handleEmployerBillingEvent(stripe([SPOT_PRICE]), db as never, event('checkout.session.completed', session({ client_reference_id: null })))
    expect(state.alerts[0]).toMatch(/needs matching/)
  })
})

describe('Pro', () => {
  const proSession = (overrides: Record<string, unknown> = {}) => session({ mode: 'subscription', payment_link: PRO_LINK, subscription: 'sub_1', amount_total: 20000, ...overrides })
  const invoice = (overrides: Record<string, unknown> = {}) => ({
    id: 'in_1', billing_reason: 'subscription_create', amount_paid: 20000, currency: 'xcd', customer: 'cus_1',
    parent: { subscription_details: { subscription: 'sub_1' } },
    lines: { data: [{ pricing: { price_details: { price: PRO_PRICE } }, period: { start: 1764000000, end: 1766592000 } }] },
    ...overrides,
  })

  it('binds the subscription on checkout and issues the month on the paid invoice', async () => {
    const db = recorder()
    await handleEmployerBillingEvent(stripe([PRO_PRICE]), db as never, event('checkout.session.completed', proSession()))
    expect(db.calls[0]).toEqual({ name: 'record_pro_checkout', args: expect.objectContaining({ p_subscription_id: 'sub_1' }) })
    await handleEmployerBillingEvent(stripe([PRO_PRICE]), db as never, event('invoice.paid', invoice()))
    expect(db.calls[1]).toEqual({ name: 'record_pro_invoice', args: expect.objectContaining({
      p_invoice_id: 'in_1', p_subscription_id: 'sub_1', p_payment_intent: 'pi_invoice', p_amount: 20000,
      p_period_start: new Date(1764000000 * 1000).toISOString(), p_period_end: new Date(1766592000 * 1000).toISOString(),
    }) })
  })

  it('uses invoice.paid only, so the paired payment_succeeded event never reaches the legacy flow or double-counts', async () => {
    const db = recorder()
    expect(await handleEmployerBillingEvent(stripe([PRO_PRICE]), db as never, event('invoice.payment_succeeded', invoice())))
      .toEqual({ handled: true, outcome: 'ignored' })
    expect(names(db)).not.toContain('record_pro_invoice')
  })

  it('issues no month or credit for prorations, failed attempts or a wrong amount', async () => {
    for (const [type, overrides, outcome] of [
      ['invoice.paid', { billing_reason: 'subscription_update' }, 'not_a_billing_month'],
      ['invoice.paid', { amount_paid: 6700 }, 'amount_mismatch'],
      ['invoice.payment_failed', {}, 'ignored'],
    ] as const) {
      const db = recorder()
      expect(await handleEmployerBillingEvent(stripe([PRO_PRICE]), db as never, event(type, invoice(overrides)))).toEqual({ handled: true, outcome })
      expect(names(db)).not.toContain('record_pro_invoice')
    }
  })

  it('leaves invoices for other subscriptions alone', async () => {
    const db = recorder()
    const other = invoice({ lines: { data: [{ pricing: { price_details: { price: 'price_legacy' } }, period: { start: 1, end: 2 } }] } })
    expect(await handleEmployerBillingEvent(stripe([]), db as never, event('invoice.paid', other))).toEqual({ handled: false })
  })

  it('records a cancellation without ending access', async () => {
    const db = recorder({ knownSubscription: true })
    const result = await handleEmployerBillingEvent(stripe([]), db as never, event('customer.subscription.updated', {
      id: 'sub_1', status: 'active', cancel_at_period_end: true, customer: 'cus_1', items: { data: [{ price: { id: PRO_PRICE } }] },
    }))
    expect(result).toEqual({ handled: true, outcome: 'active' })
    expect(names(db)).not.toContain('reconcile_employer_refund')
  })
})

describe('refunds and disputes', () => {
  it('reconciles a refund of one of our payments, and classifies partial refunds and disputes', async () => {
    for (const [type, object, kind] of [
      ['charge.refunded', { payment_intent: 'pi_1', refunded: true }, 'refunded'],
      ['charge.refunded', { payment_intent: 'pi_1', refunded: false }, 'partial_refund'],
      ['charge.dispute.created', { payment_intent: 'pi_1' }, 'disputed'],
    ] as const) {
      const db = recorder({ order: true, rpcResult: { outcome: kind } })
      await handleEmployerBillingEvent(stripe([]), db as never, event(type, object))
      expect(db.calls).toEqual([{ name: 'reconcile_employer_refund', args: expect.objectContaining({ p_payment_intent: 'pi_1', p_kind: kind }) }])
    }
  })

  it('passes other charges through untouched (Verified and legacy handle their own)', async () => {
    const db = recorder()
    expect(await handleEmployerBillingEvent(stripe([]), db as never, event('charge.refunded', { payment_intent: 'pi_verified', refunded: true }))).toEqual({ handled: false })
    expect(db.calls).toHaveLength(0)
  })
})
