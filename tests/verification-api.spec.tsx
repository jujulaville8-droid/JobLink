// @vitest-environment node
/**
 * Route-level guarantees for JobLink Verified, with Supabase and Stripe
 * replaced by in-memory fakes: who may open a document, when uploads are
 * accepted, how a payment is applied, and what a decision does to the files.
 */
import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { FakeDb } from './helpers/fake-supabase'

const state = vi.hoisted(() => ({
  db: null as unknown as import('./helpers/fake-supabase').FakeDb,
  user: { id: 'seeker-user', email: 'sam@example.com' } as { id: string; email: string } | null,
  twoStep: true,
  isAdmin: false,
  refunds: [] as { payment_intent: string; key: string }[],
  refundFails: false,
  emails: [] as { to: string; type: string }[],
  checkoutSessions: [] as Record<string, unknown>[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }))
vi.mock('@/lib/email', () => ({
  BASE_URL: 'https://joblinkantigua.com',
  sendEmail: async (email: { to: string; type: string }) => { state.emails.push(email); return { success: true, id: 'email' } },
}))
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    refunds: { create: async (body: { payment_intent: string }, options: { idempotencyKey: string }) => {
      if (state.refundFails) throw new Error('stripe down')
      state.refunds.push({ payment_intent: body.payment_intent, key: options.idempotencyKey })
      return { id: `re_${state.refunds.length}`, status: 'succeeded' }
    } },
    checkout: { sessions: { create: async (body: Record<string, unknown>) => { state.checkoutSessions.push(body); return { url: 'https://checkout.stripe.com/c/pay/test' } } } },
  }),
}))
vi.mock('@/lib/api-auth', () => {
  const denied = (status: number, code?: string) => ({ error: NextResponse.json({ error: 'no', code }, { status }) })
  const signedIn = async () => (state.user ? { user: state.user, supabase: state.db, isAdmin: state.isAdmin } : denied(401))
  return {
    requireVerifiedUser: signedIn,
    requireUser: signedIn,
    requireAdmin: async () => (state.user && state.isAdmin ? signedIn() : denied(403)),
    requireAdminTwoStep: async () => {
      if (!state.user || !state.isAdmin) return denied(state.user ? 403 : 401)
      return state.twoStep ? signedIn() : denied(403, 'MFA_REQUIRED')
    },
    hasTwoStepSession: async () => state.twoStep,
    adminTwoStepEnforced: () => false,
  }
})

import { GET as openDocument } from '@/app/api/verification/documents/[shareId]/route'
import { POST as upload } from '@/app/api/verification/[id]/upload/route'
import { POST as checkout } from '@/app/api/verification/checkout/route'
import { DELETE as deleteDocuments, GET as status } from '@/app/api/verification/route'
import { DELETE as stopSharing } from '@/app/api/verification/shares/[id]/route'
import { GET as preview } from '@/app/api/verification/preview/route'
import { GET as queue } from '@/app/api/admin/verifications/route'
import { POST as decide } from '@/app/api/admin/verifications/[id]/route'
import { GET as reviewFile } from '@/app/api/admin/verifications/[id]/file/route'
import { POST as openUploads } from '@/app/api/admin/verifications/settings/route'
import { GET as dailyJob } from '@/app/api/cron/verification-expiry/route'
import { handleVerificationPayment } from '@/lib/verification/payment'
import { storeDocument } from '@/lib/verification/files'
import { recordShare, sharedEmailLine } from '@/lib/verification/sharing'
import { CONSENT_VERSION, REVIEW_CHECKLIST, addMonths, antiguaToday } from '@/lib/verification/shared'

const V = '0b0f6a0e-1111-4222-8333-444455556666'
const SHARE = '0b0f6a0e-2222-4222-8333-444455556666'
const ORIGIN = 'https://joblinkantigua.com'
const today = antiguaToday()
const future = addMonths(today, 5)
const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

async function pdf(text = 'Police certificate') {
  const doc = await PDFDocument.create()
  doc.addPage([300, 400]).drawText(text)
  return Buffer.from(await doc.save())
}

function verification(overrides: Record<string, unknown> = {}) {
  return {
    id: V, seeker_id: 'profile-1', user_id: 'seeker-user', status: 'approved',
    stripe_checkout_session_id: 'cs_1', stripe_payment_intent_id: 'pi_1', paid_at: '2026-11-01T00:00:00Z',
    consent_at: '2026-11-02T00:00:00Z', consent_version: CONSENT_VERSION,
    rtw_group_claimed: 'citizen', rtw_group: 'citizen', rtw_document_type: 'passport', rtw_document_expires_on: null,
    rtw_file_path: null, police_record_issued_on: today, police_record_file_path: null, police_record_sha256: null,
    key_version: 1, sharing_notice: false, verified_until: future, confirmation_code: 'ABCDEFGH23',
    submitted_at: new Date().toISOString(), reviewed_at: new Date().toISOString(), reviewed_by: 'admin-user',
    decision_reason: null, reupload_documents: [], refunded_at: null, stripe_refund_id: null,
    expiry_reminder_sent_at: null, upload_reminder_sent_at: null, created_at: '2026-11-01T00:00:00Z',
    seeker_profiles: { first_name: 'Sam', last_name: 'Seeker' },
    ...overrides,
  }
}

/** A database with one job seeker, one employer who received a share, and a stored police record. */
async function seed(overrides: Record<string, unknown> = {}, shareOverrides: Record<string, unknown> = {}) {
  const db = new FakeDb({
    users: [
      { id: 'seeker-user', role: 'seeker', email: 'sam@example.com' },
      { id: 'employer-user', role: 'employer', email: 'boss@example.com' },
      { id: 'admin-user', role: 'seeker', email: 'admin@example.com', is_admin: true },
    ],
    seeker_profiles: [{ id: 'profile-1', user_id: 'seeker-user', first_name: 'Sam', last_name: 'Seeker' }],
    verification_settings: [{ uploads_open: true, opened_at: '2026-11-01T00:00:00Z' }],
    seeker_verifications: [], verification_shares: [], verification_views: [], verification_events: [],
  })
  state.db = db
  const row = verification(overrides) as Record<string, unknown>
  if (!('police_record_file_path' in overrides) && ['approved', 'submitted'].includes(row.status as string)) {
    const stored = await storeDocument(db as never, V, 'police_record', await pdf())
    Object.assign(row, { police_record_file_path: stored.path, police_record_sha256: stored.sha256 })
  }
  if (row.status === 'submitted' && !('rtw_file_path' in overrides)) {
    row.rtw_file_path = (await storeDocument(db as never, V, 'rtw', await pdf('Passport'))).path
  }
  db.tables.seeker_verifications.push(row)
  db.tables.verification_shares.push({
    id: SHARE, application_id: 'application-1', verification_id: V, share_police_record: true, share_rtw: true,
    shared_at: '2026-11-10T12:00:00Z', revoked_at: null,
    seeker_verifications: row,
    applications: {
      seeker_profiles: { first_name: 'Sam', last_name: 'Seeker' },
      job_listings: { title: 'Security officer', companies: { id: 'company-1', user_id: 'employer-user', company_name: 'Acme Security', is_confidential: false } },
    },
    verification_views: [],
    ...shareOverrides,
  })
  return db
}

const as = (id: string | null, options: { admin?: boolean; twoStep?: boolean } = {}) => {
  state.user = id ? { id, email: `${id}@example.com` } : null
  state.isAdmin = options.admin === true
  state.twoStep = options.twoStep !== false
}
const get = (url: string) => new Request(`${ORIGIN}${url}`)
const json = (url: string, body: unknown, method = 'POST', origin = ORIGIN) =>
  new Request(`${ORIGIN}${url}`, { method, headers: { 'Content-Type': 'application/json', origin, host: 'joblinkantigua.com', 'x-forwarded-proto': 'https' }, body: JSON.stringify(body) })
const events = (name: string) => state.db.tables.verification_events.filter((event) => event.event === name)
const document = (kind: string, share = SHARE) =>
  openDocument(get(`/api/verification/documents/${share}?document=${kind}`), { params: Promise.resolve({ shareId: share }) })

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('VERIFICATION_ENABLED', 'true')
  vi.stubEnv('VERIFICATION_CHECKOUT_ENABLED', 'true')
  vi.stubEnv('VERIFICATION_PRICE_ID', 'price_verified40')
  vi.stubEnv('VERIFICATION_FILE_KEY', randomBytes(32).toString('base64'))
  vi.stubEnv('VERIFICATION_FILE_KEY_VERSION', '1')
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  Object.assign(state, { refunds: [], refundFails: false, emails: [], checkoutSessions: [] })
  as('seeker-user')
})

describe('everything is off until switched on', () => {
  it('answers 404 on every route while VERIFICATION_ENABLED is off', async () => {
    await seed()
    vi.stubEnv('VERIFICATION_ENABLED', 'false')
    as('admin-user', { admin: true })
    const id = { params: Promise.resolve({ id: V }) }
    const responses = await Promise.all([
      status(), checkout(json('/api/verification/checkout', {})), document('police_record'),
      preview(get('/api/verification/preview?document=police_record')), queue(),
      decide(json(`/api/admin/verifications/${V}`, { decision: 'not_approved', reason: 'name_mismatch' }), id),
      reviewFile(get(`/api/admin/verifications/${V}/file?document=rtw`), id),
      openUploads(json('/api/admin/verifications/settings', { upgraded: true })),
    ])
    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(404))
  })

  it('pauses sales without hiding existing badges', async () => {
    await seed()
    vi.stubEnv('VERIFICATION_CHECKOUT_ENABLED', 'false')
    expect((await checkout(json('/api/verification/checkout', {}))).status).toBe(404)
    const body = await (await status()).json()
    expect(body.checkoutEnabled).toBe(false)
    expect(body.badge.valid).toBe(true)
  })

  it('will not sell a check it could not carry out', async () => {
    await seed({ status: 'expired', police_record_file_path: null })
    vi.stubEnv('VERIFICATION_FILE_KEY', '')
    expect((await checkout(json('/api/verification/checkout', {}))).status).toBe(404)
  })
})

describe('an employer opening shared documents', () => {
  it('gets the stamped police record and the view is logged first', async () => {
    const db = await seed()
    as('employer-user')
    const response = await document('police_record')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toContain('no-store')
    const stamped = await PDFDocument.load(Buffer.from(await response.arrayBuffer()))
    expect(stamped.getPage(0).getSize().height).toBe(430)
    expect(db.tables.verification_views).toEqual([expect.objectContaining({ share_id: SHARE, viewer_id: 'employer-user', company_id: 'company-1', document: 'police_record' })])
    expect(db.tables.verification_views[0]).not.toHaveProperty('ip')
    expect(events('file_opened_by_employer')).toHaveLength(1)
  })

  it('gets a right-to-work confirmation, never the ID image', async () => {
    await seed()
    as('employer-user')
    const response = await document('rtw')
    expect(response.status).toBe(200)
    expect((await PDFDocument.load(Buffer.from(await response.arrayBuffer()))).getPageCount()).toBe(1)
  })

  it.each([
    ['a different employer', async () => { await seed(); as('other-employer') }],
    ['the job seeker using the employer link', async () => { await seed(); as('seeker-user') }],
    ['an admin', async () => { await seed(); as('admin-user', { admin: true }) }],
    ['sharing was stopped', async () => { await seed({}, { revoked_at: '2026-11-11T00:00:00Z' }); as('employer-user') }],
    ['the badge expired', async () => { await seed({ verified_until: yesterday }); as('employer-user') }],
    ['the documents were deleted', async () => { await seed({ status: 'withdrawn', police_record_file_path: null }); as('employer-user') }],
    ['the police record was not ticked', async () => { await seed({}, { share_police_record: false }); as('employer-user') }],
  ])('gets the same not-found when %s', async (_case, arrange) => {
    await arrange()
    const response = await document('police_record')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
    expect(state.db.tables.verification_views).toHaveLength(0)
  })

  it('gets not-found for a share that does not exist or a made-up document', async () => {
    await seed()
    as('employer-user')
    expect((await document('police_record', '0b0f6a0e-9999-4222-8333-444455556666')).status).toBe(404)
    expect((await document('passport')).status).toBe(404)
    expect((await document('police_record', '../../etc')).status).toBe(404)
  })

  it('is refused when signed out', async () => {
    await seed()
    as(null)
    expect((await document('police_record')).status).toBe(401)
  })

  it('hands nothing over if the view cannot be logged', async () => {
    const db = await seed()
    db.failures['verification_views.insert'] = { code: 'XX000', message: 'down' }
    as('employer-user')
    const response = await document('police_record')
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).not.toBe('application/pdf')
  })
})

describe('the job seeker stays in control', () => {
  it('sees their shares and who opened them, without file paths or payment ids', async () => {
    const db = await seed()
    db.tables.verification_shares[0].verification_views = [{ document: 'police_record', viewed_at: '2026-11-12T10:00:00Z' }]
    const body = await (await status()).json()
    expect(body.shares[0]).toMatchObject({ employer: 'Acme Security', job_title: 'Security officer', views: [{ document: 'police_record' }] })
    const text = JSON.stringify(body)
    for (const secret of ['police_record_file_path', 'police-', 'pi_1', 'cs_1', 'sha256', 'reviewed_by']) expect(text).not.toContain(secret)
  })

  it('hides a confidential employer\'s name in the share list', async () => {
    const db = await seed()
    ;(db.tables.verification_shares[0].applications as { job_listings: { companies: { is_confidential: boolean } } }).job_listings.companies.is_confidential = true
    expect((await (await status()).json()).shares[0].employer).toBe('Confidential employer')
  })

  it('can stop sharing, after which the employer is refused', async () => {
    await seed()
    const stopped = await stopSharing(json(`/api/verification/shares/${SHARE}`, {}, 'DELETE'), { params: Promise.resolve({ id: SHARE }) })
    expect(stopped.status).toBe(200)
    expect(events('sharing_stopped')).toHaveLength(1)
    as('employer-user')
    expect((await document('police_record')).status).toBe(404)
  })

  it('cannot stop someone else\'s share', async () => {
    const db = await seed()
    as('other-seeker')
    db.tables.users.push({ id: 'other-seeker', role: 'seeker' })
    db.tables.seeker_profiles.push({ id: 'profile-2', user_id: 'other-seeker', first_name: 'O', last_name: 'T' })
    const response = await stopSharing(json(`/api/verification/shares/${SHARE}`, {}, 'DELETE'), { params: Promise.resolve({ id: SHARE }) })
    expect(response.status).toBe(404)
    expect(db.tables.verification_shares[0].revoked_at).toBeNull()
  })

  it('can delete their documents: the file goes, the badge ends, every view is refused', async () => {
    const db = await seed()
    expect(db.files.size).toBe(1)
    expect((await deleteDocuments(json('/api/verification', {}, 'DELETE'))).status).toBe(200)
    expect(db.files.size).toBe(0)
    expect(db.tables.seeker_verifications[0]).toMatchObject({ status: 'withdrawn', police_record_file_path: null })
    expect(db.tables.verification_shares[0].revoked_at).not.toBeNull()
    expect(events('file_deleted')).toHaveLength(1)
    as('employer-user')
    expect((await document('police_record')).status).toBe(404)
    expect((await document('rtw')).status).toBe(404)
  })

  it('keeps the badge if the file could not be deleted, rather than claim a deletion that did not happen', async () => {
    const db = await seed()
    db.storageFailures.remove = true
    expect((await deleteDocuments(json('/api/verification', {}, 'DELETE'))).status).toBe(503)
    expect(db.tables.seeker_verifications[0].status).toBe('approved')
    expect(events('file_deleted')).toHaveLength(0)
  })

  it('previews the exact stamped copy, and that open is logged too', async () => {
    await seed()
    const response = await preview(get('/api/verification/preview?document=police_record'))
    expect(response.status).toBe(200)
    expect(events('file_opened_by_owner')).toHaveLength(1)
  })

  it('refuses state-changing requests from another site', async () => {
    await seed()
    expect((await deleteDocuments(json('/api/verification', {}, 'DELETE', 'https://evil.example'))).status).toBe(400)
    expect((await checkout(json('/api/verification/checkout', {}, 'POST', 'https://evil.example'))).status).toBe(400)
  })

  it('only job seeker accounts can use it', async () => {
    await seed()
    as('employer-user')
    expect((await status()).status).toBe(403)
  })
})

describe('checkout and payment', () => {
  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'cs_new', mode: 'payment', payment_status: 'paid', amount_total: 4000, currency: 'xcd', payment_intent: 'pi_new',
    metadata: { purchase_type: 'seeker_verification', verification_id: V, user_id: 'seeker-user' }, ...overrides,
  }) as never

  it('creates one awaiting-payment check and a one-off session carrying its id', async () => {
    const db = await seed({ status: 'expired', police_record_file_path: null })
    db.tables.seeker_verifications = []
    const response = await checkout(json('/api/verification/checkout', {}))
    expect(await response.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/test' })
    expect(db.tables.seeker_verifications).toHaveLength(1)
    expect(state.checkoutSessions[0]).toMatchObject({ mode: 'payment', line_items: [{ price: 'price_verified40', quantity: 1 }] })
    expect((state.checkoutSessions[0].metadata as Record<string, string>).verification_id).toBe(db.tables.seeker_verifications[0].id)
    // A second tap reuses the same check.
    await checkout(json('/api/verification/checkout', {}))
    expect(db.tables.seeker_verifications).toHaveLength(1)
  })

  it('refuses a second purchase while one is in progress or the badge has months left', async () => {
    await seed({ status: 'submitted' })
    expect((await checkout(json('/api/verification/checkout', {}))).status).toBe(409)
    await seed()
    const response = await checkout(json('/api/verification/checkout', {}))
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('ALREADY_VERIFIED')
  })

  it('allows a renewal in the last 30 days', async () => {
    await seed({ verified_until: addMonths(today, 0) })
    expect((await checkout(json('/api/verification/checkout', {}))).status).toBe(200)
  })

  it('marks the check paid once and tells the job seeker to upload', async () => {
    const db = await seed({ status: 'awaiting_payment', stripe_checkout_session_id: null, stripe_payment_intent_id: null, paid_at: null })
    expect(await handleVerificationPayment(db as never, session())).toBe('paid')
    expect(db.tables.seeker_verifications[0]).toMatchObject({ status: 'paid', stripe_checkout_session_id: 'cs_new', stripe_payment_intent_id: 'pi_new' })
    expect(state.emails).toEqual([expect.objectContaining({ to: 'sam@example.com', type: 'verification_upload_ready' })])
    // The same delivery again changes nothing and sends nothing.
    expect(await handleVerificationPayment(db as never, session())).toBe('duplicate')
    expect(state.emails).toHaveLength(1)
  })

  it('tells them to expect an email when uploads are still locked', async () => {
    const db = await seed({ status: 'awaiting_payment', stripe_checkout_session_id: null, paid_at: null })
    db.tables.verification_settings[0].uploads_open = false
    await handleVerificationPayment(db as never, session())
    expect(state.emails[0].type).toBe('verification_paid_waiting')
  })

  it.each([
    ['a wrong amount', { amount_total: 100 }],
    ['a wrong currency', { currency: 'usd' }],
    ['an unpaid session', { payment_status: 'unpaid' }],
    ['a subscription', { mode: 'subscription' }],
    ['someone else\'s check', { metadata: { purchase_type: 'seeker_verification', verification_id: V, user_id: 'attacker' } }],
    ['no reference', { metadata: { purchase_type: 'seeker_verification' } }],
  ])('refuses %s', async (_case, overrides) => {
    const db = await seed({ status: 'awaiting_payment', stripe_checkout_session_id: null, paid_at: null })
    expect(await handleVerificationPayment(db as never, session(overrides))).toBe('refused')
    expect(db.tables.seeker_verifications[0].status).toBe('awaiting_payment')
  })

  it('flags a second payment for a check that is already paid instead of losing it', async () => {
    const db = await seed({ status: 'paid' })
    expect(await handleVerificationPayment(db as never, session({ id: 'cs_other' }))).toBe('refused')
  })
})

describe('uploading', () => {
  const send = async (fields: Record<string, string>, files: { name: string; bytes: Buffer }[] = [], id = V) => {
    const form = new FormData()
    for (const [key, value] of Object.entries({ consent: 'yes', consent_version: CONSENT_VERSION, ...fields })) if (value) form.set(key, value)
    for (const file of files) form.append('files', new File([new Uint8Array(file.bytes)], file.name))
    const request = new NextRequest(`${ORIGIN}/api/verification/${id}/upload`, { method: 'POST', body: form, headers: { origin: ORIGIN, host: 'joblinkantigua.com', 'x-forwarded-proto': 'https' } })
    return upload(request, { params: Promise.resolve({ id }) })
  }
  const paid = { status: 'paid', police_record_file_path: null, rtw_file_path: null, consent_at: null, consent_version: null, submitted_at: null, rtw_group_claimed: null }

  it('stores each document encrypted, records consent, then submits for review', async () => {
    const db = await seed(paid)
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ccd' } }).jpeg().toBuffer()
    expect((await send({ action: 'document', document: 'rtw' }, [{ name: 'passport.jpg', bytes: photo }])).status).toBe(200)
    const plain = await pdf('POLICE CERTIFICATE OF CHARACTER')
    const second = await send({ action: 'document', document: 'police_record' }, [{ name: 'record.pdf', bytes: plain }])
    expect(second.status).toBe(200)
    const row = db.tables.seeker_verifications[0]
    expect(row.consent_at).toBeTruthy()
    expect(row.consent_version).toBe(CONSENT_VERSION)
    expect(db.files.size).toBe(2)
    for (const [name, bytes] of db.files) {
      expect(name).toMatch(new RegExp(`^${V}/(rtw|police)-[0-9a-f-]{36}\\.enc$`))
      expect(bytes.subarray(0, 4).toString()).toBe('JLV1')
      expect(bytes.includes(Buffer.from('%PDF'))).toBe(false)
    }
    expect(JSON.stringify(await second.clone().json())).not.toContain('.enc')
    expect(events('uploaded')).toHaveLength(2)

    const submitted = await send({ action: 'submit', group: 'citizen' })
    expect(submitted.status).toBe(200)
    expect(row).toMatchObject({ status: 'submitted', rtw_group_claimed: 'citizen' })
  })

  it('is refused while uploads are closed', async () => {
    const db = await seed(paid)
    db.tables.verification_settings[0].uploads_open = false
    const response = await send({ action: 'document', document: 'police_record' }, [{ name: 'r.pdf', bytes: await pdf() }])
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('UPLOADS_LOCKED')
    expect(db.files.size).toBe(0)
  })

  it.each(['awaiting_payment', 'submitted', 'approved', 'not_approved'])('is refused when the check is %s', async (current) => {
    const db = await seed({ ...paid, status: current })
    const response = await send({ action: 'document', document: 'police_record' }, [{ name: 'r.pdf', bytes: await pdf() }])
    expect(response.status).toBe(409)
    expect(db.files.size).toBe(0)
  })

  it('is refused for someone else\'s check', async () => {
    const db = await seed(paid)
    as('other-seeker')
    db.tables.users.push({ id: 'other-seeker', role: 'seeker' })
    db.tables.seeker_profiles.push({ id: 'profile-2', user_id: 'other-seeker', first_name: 'O', last_name: 'T' })
    expect((await send({ action: 'document', document: 'police_record' }, [{ name: 'r.pdf', bytes: await pdf() }])).status).toBe(404)
  })

  it('needs the consent box on every request', async () => {
    const db = await seed(paid)
    const response = await send({ action: 'document', document: 'police_record', consent: '' }, [{ name: 'r.pdf', bytes: await pdf() }])
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('CONSENT_REQUIRED')
    expect(db.files.size).toBe(0)
  })

  it('refuses the wrong type, however it is named, and files over 3 MB', async () => {
    const db = await seed(paid)
    const wrong = await send({ action: 'document', document: 'police_record' }, [{ name: 'record.pdf', bytes: Buffer.from('PK\x03\x04 zip pretending') }])
    expect(wrong.status).toBe(400)
    expect((await wrong.json()).code).toBe('FILE_REFUSED')
    const big = await send({ action: 'document', document: 'police_record' }, [{ name: 'big.pdf', bytes: Buffer.concat([await pdf(), Buffer.alloc(3 * 1024 * 1024)]) }])
    expect(big.status).toBe(400)
    expect(db.files.size).toBe(0)
  })

  it('refuses a PDF with a script', async () => {
    const db = await seed(paid)
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.addJavaScript('x', 'app.alert(1)')
    const response = await send({ action: 'document', document: 'police_record' }, [{ name: 'record.pdf', bytes: Buffer.from(await doc.save()) }])
    expect(response.status).toBe(400)
    expect(db.files.size).toBe(0)
  })

  it('cannot be submitted with a document missing', async () => {
    await seed(paid)
    await send({ action: 'document', document: 'rtw' }, [{ name: 'p.pdf', bytes: await pdf() }])
    expect((await send({ action: 'submit', group: 'citizen' })).status).toBe(400)
  })

  it('leaves no file behind when the record cannot be saved', async () => {
    const db = await seed(paid)
    db.failures['seeker_verifications.update'] = { code: 'XX000', message: 'down' }
    const response = await send({ action: 'document', document: 'police_record' }, [{ name: 'r.pdf', bytes: await pdf() }])
    expect(response.status).toBe(503)
    expect(db.files.size).toBe(0)
  })

  it('on a re-upload, only takes the document that was asked for', async () => {
    const db = await seed({ ...paid, status: 'reupload_needed', reupload_documents: ['police_record'], rtw_file_path: `${V}/rtw-kept.enc`, consent_at: 'x', rtw_group_claimed: 'citizen', submitted_at: 'x' })
    expect((await send({ action: 'document', document: 'rtw' }, [{ name: 'p.pdf', bytes: await pdf() }])).status).toBe(409)
    expect((await send({ action: 'document', document: 'police_record' }, [{ name: 'r.pdf', bytes: await pdf() }])).status).toBe(200)
    expect((await send({ action: 'submit' })).status).toBe(200)
    expect(db.tables.seeker_verifications[0]).toMatchObject({ status: 'submitted', reupload_documents: [] })
  })
})

describe('admin review', () => {
  const id = { params: Promise.resolve({ id: V }) }
  const approve = (overrides: Record<string, unknown> = {}) => json(`/api/admin/verifications/${V}`, {
    decision: 'approve', rtw_group: 'citizen', rtw_document_type: 'passport', rtw_document_expires_on: null,
    police_record_issued_on: today, sharing_notice: false, checklist: REVIEW_CHECKLIST.map((item) => item.id), ...overrides,
  })

  it.each([
    ['a job seeker', () => as('seeker-user'), 403],
    ['a signed-out visitor', () => as(null), 401],
    ['an admin without two-step login', () => as('admin-user', { admin: true, twoStep: false }), 403],
  ])('refuses %s on every admin route', async (_who, arrange, expected) => {
    const db = await seed({ status: 'submitted' })
    arrange()
    const responses = await Promise.all([
      queue(), decide(approve(), id), reviewFile(get(`/api/admin/verifications/${V}/file?document=police_record`), id),
      openUploads(json('/api/admin/verifications/settings', { upgraded: true })),
    ])
    expect(responses.map((response) => response.status)).toEqual(Array(4).fill(expected))
    expect(db.tables.seeker_verifications[0].status).toBe('submitted')
    expect(events('file_opened_by_reviewer')).toHaveLength(0)
  })

  it('shows the queue without file paths', async () => {
    await seed({ status: 'submitted' })
    as('admin-user', { admin: true })
    const body = await (await queue()).json()
    expect(body.waiting).toHaveLength(1)
    expect(body.waiting[0]).toMatchObject({ name: 'Sam Seeker', rtw_group_claimed: 'citizen', has_police_record_file: true })
    expect(JSON.stringify(body)).not.toContain('.enc')
  })

  it('streams a document to the reviewer and logs the open against them', async () => {
    await seed({ status: 'submitted' })
    as('admin-user', { admin: true })
    const response = await reviewFile(get(`/api/admin/verifications/${V}/file?document=police_record`), id)
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
    expect(events('file_opened_by_reviewer')).toEqual([expect.objectContaining({ actor_id: 'admin-user', actor_role: 'admin', document: 'police_record' })])
  })

  it('no longer opens documents once the check is decided', async () => {
    await seed()
    as('admin-user', { admin: true })
    expect((await reviewFile(get(`/api/admin/verifications/${V}/file?document=police_record`), id)).status).toBe(404)
  })

  it('approves: badge runs 6 months from the record date, the ID image is deleted, the record is kept', async () => {
    const db = await seed({ status: 'submitted', verified_until: null, confirmation_code: null, reviewed_at: null })
    as('admin-user', { admin: true })
    expect(db.files.size).toBe(2)
    const response = await decide(approve({ sharing_notice: true }), id)
    expect(response.status).toBe(200)
    const row = db.tables.seeker_verifications[0]
    expect(row).toMatchObject({ status: 'approved', verified_until: addMonths(today, 6), rtw_file_path: null, reviewed_by: 'admin-user', sharing_notice: true })
    expect(row.confirmation_code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect([...db.files.keys()]).toEqual([row.police_record_file_path])
    expect(state.emails).toEqual([expect.objectContaining({ type: 'verification_approved' })])
    expect(state.refunds).toHaveLength(0)
  })

  it('a work permit ends the badge sooner and needs its expiry date', async () => {
    const db = await seed({ status: 'submitted' })
    as('admin-user', { admin: true })
    expect((await decide(approve({ rtw_group: 'work_permit', rtw_document_type: 'work_permit' }), id)).status).toBe(409)
    const soon = addMonths(today, 2)
    expect((await decide(approve({ rtw_group: 'work_permit', rtw_document_type: 'work_permit', rtw_document_expires_on: soon }), id)).status).toBe(200)
    expect(db.tables.seeker_verifications[0].verified_until).toBe(soon)
  })

  it.each([
    ['the checklist is incomplete', { checklist: ['name'] }, 400],
    ['the police record is over 30 days old', { police_record_issued_on: addMonths(today, -2) }, 409],
    ['the police record is dated in the future', { police_record_issued_on: addMonths(today, 1) }, 409],
    ['the document has expired', { rtw_document_expires_on: yesterday }, 409],
    ['the document type does not fit the group', { rtw_document_type: 'work_permit' }, 409],
    ['there is a free-text field about the record', { notes: 'has a conviction' }, 400],
  ])('will not approve when %s', async (_case, overrides, expected) => {
    const db = await seed({ status: 'submitted' })
    as('admin-user', { admin: true })
    expect((await decide(approve(overrides), id)).status).toBe(expected)
    expect(db.tables.seeker_verifications[0].status).toBe('submitted')
    expect(db.files.size).toBe(2)
  })

  it('not approved: refunds in full, deletes both files, emails the reason', async () => {
    const db = await seed({ status: 'submitted' })
    as('admin-user', { admin: true })
    const response = await decide(json(`/api/admin/verifications/${V}`, { decision: 'not_approved', reason: 'name_mismatch' }), id)
    expect(response.status).toBe(200)
    expect(state.refunds).toEqual([{ payment_intent: 'pi_1', key: `verification-refund-${V}` }])
    expect(db.tables.seeker_verifications[0]).toMatchObject({ status: 'not_approved', decision_reason: 'name_mismatch', stripe_refund_id: 're_1', rtw_file_path: null, police_record_file_path: null })
    expect(db.files.size).toBe(0)
    expect(events('refunded')).toHaveLength(1)
    expect(events('file_deleted')).toHaveLength(2)
    expect(state.emails).toEqual([expect.objectContaining({ type: 'verification_not_approved' })])
  })

  it('does not mark anyone not approved if the refund fails', async () => {
    const db = await seed({ status: 'submitted' })
    state.refundFails = true
    as('admin-user', { admin: true })
    const response = await decide(json(`/api/admin/verifications/${V}`, { decision: 'not_approved', reason: 'name_mismatch' }), id)
    expect(response.status).toBe(503)
    expect(db.tables.seeker_verifications[0].status).toBe('submitted')
    expect(state.emails).toHaveLength(0)
  })

  it('has no way to refuse someone over what their record says', async () => {
    await seed({ status: 'submitted' })
    as('admin-user', { admin: true })
    for (const reason of ['has_conviction', 'record_not_clean', 'no_upload_received']) {
      expect((await decide(json(`/api/admin/verifications/${V}`, { decision: 'not_approved', reason }), id)).status).toBe(400)
    }
  })

  it('asks for a re-upload: free, the redone file is deleted, the other is kept', async () => {
    const db = await seed({ status: 'submitted' })
    as('admin-user', { admin: true })
    const kept = db.tables.seeker_verifications[0].rtw_file_path
    const response = await decide(json(`/api/admin/verifications/${V}`, { decision: 'reupload', documents: ['police_record'], reason: 'photo_unreadable' }), id)
    expect(response.status).toBe(200)
    expect(db.tables.seeker_verifications[0]).toMatchObject({ status: 'reupload_needed', reupload_documents: ['police_record'], police_record_file_path: null, rtw_file_path: kept })
    expect([...db.files.keys()]).toEqual([kept])
    expect(state.refunds).toHaveLength(0)
  })

  it('a decision cannot be made twice', async () => {
    await seed()
    as('admin-user', { admin: true })
    expect((await decide(approve(), id)).status).toBe(409)
  })

  it('opens uploads once, emails everyone waiting, and needs the confirmation tick', async () => {
    const db = await seed({ status: 'paid', police_record_file_path: null, users: { email: 'sam@example.com' } })
    db.tables.verification_settings[0] = { uploads_open: false, opened_at: null }
    as('admin-user', { admin: true })
    expect((await openUploads(json('/api/admin/verifications/settings', { upgraded: false }))).status).toBe(400)
    const opened = await openUploads(json('/api/admin/verifications/settings', { upgraded: true }))
    expect(await opened.json()).toMatchObject({ success: true, emailed: 1 })
    expect(db.tables.verification_settings[0]).toMatchObject({ uploads_open: true, opened_by: 'admin-user' })
    expect((await (await openUploads(json('/api/admin/verifications/settings', { upgraded: true }))).json()).alreadyOpen).toBe(true)
    expect(state.emails).toHaveLength(1)
  })

  it('will not open uploads without the encryption key or if the folder is public', async () => {
    const db = await seed({ status: 'paid', police_record_file_path: null })
    db.tables.verification_settings[0] = { uploads_open: false, opened_at: null }
    as('admin-user', { admin: true })
    db.bucketPublic = true
    expect((await openUploads(json('/api/admin/verifications/settings', { upgraded: true }))).status).toBe(503)
    db.bucketPublic = false
    vi.stubEnv('VERIFICATION_FILE_KEY', '')
    expect((await openUploads(json('/api/admin/verifications/settings', { upgraded: true }))).status).toBe(409)
    expect(db.tables.verification_settings[0].uploads_open).toBe(false)
  })
})

describe('the daily job', () => {
  const run = (secret = 'cron-secret') => dailyJob(new NextRequest(`${ORIGIN}/api/cron/verification-expiry`, { headers: { authorization: `Bearer ${secret}` } }))

  it('needs the cron secret', async () => {
    await seed()
    expect((await run('wrong')).status).toBe(401)
    vi.stubEnv('CRON_SECRET', '')
    expect((await dailyJob(new NextRequest(`${ORIGIN}/api/cron/verification-expiry`, { headers: { authorization: 'Bearer ' } }))).status).toBe(401)
  })

  it('expires a badge past its end date, deletes its file and says so; leaves valid ones alone', async () => {
    const db = await seed({ verified_until: yesterday })
    const other = { ...verification({ id: 'still-valid', user_id: 'other', seeker_id: 'profile-9' }), police_record_file_path: 'still-valid/police-x.enc' }
    db.tables.seeker_verifications.push(other)
    db.files.set('still-valid/police-x.enc', Buffer.from('kept'))
    const result = await (await run()).json()
    expect(result.expired).toBe(1)
    expect(db.tables.seeker_verifications[0]).toMatchObject({ status: 'expired', police_record_file_path: null })
    expect(other.status).toBe('approved')
    expect([...db.files.keys()]).toEqual(['still-valid/police-x.enc'])
    expect(events('file_deleted')).toHaveLength(1)
    expect(state.emails).toEqual([expect.objectContaining({ type: 'verification_expired' })])
  })

  it('a badge is still valid on its last day', async () => {
    const db = await seed({ verified_until: today, expiry_reminder_sent_at: 'sent' })
    expect((await (await run()).json()).expired).toBe(0)
    expect(db.tables.seeker_verifications[0].status).toBe('approved')
  })

  it('sends the 14-day reminder once', async () => {
    const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 10 * 86_400_000).toISOString().slice(0, 10)
    await seed({ verified_until: soon })
    expect((await (await run()).json()).reminders).toBe(1)
    expect((await (await run()).json()).reminders).toBe(0)
    expect(state.emails.filter((email) => email.type === 'verification_expiring')).toHaveLength(1)
  })

  it('refunds a payment with no upload after 60 days, and reminds at 30', async () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
    const db = await seed({ status: 'paid', paid_at: daysAgo(61), police_record_file_path: null })
    db.tables.seeker_verifications.push(verification({ id: 'recent', user_id: 'seeker-user', status: 'paid', paid_at: daysAgo(31), police_record_file_path: null, stripe_payment_intent_id: 'pi_2' }))
    const result = await (await run()).json()
    expect(result).toMatchObject({ refunded: 1, upload_reminders: 1 })
    expect(state.refunds).toEqual([{ payment_intent: 'pi_1', key: `verification-refund-${V}` }])
    expect(db.tables.seeker_verifications[0]).toMatchObject({ status: 'withdrawn', decision_reason: 'no_upload_received', stripe_refund_id: 're_1' })
    expect(db.tables.seeker_verifications[1].status).toBe('paid')
  })

  it('sweeps files nothing points at, and only those', async () => {
    const db = await seed()
    db.files.set(`${V}/rtw-orphan.enc`, Buffer.from('left behind'))
    const kept = db.tables.seeker_verifications[0].police_record_file_path as string
    const result = await (await run()).json()
    expect(result.swept).toBe(1)
    expect([...db.files.keys()]).toEqual([kept])
  })

  it('does nothing while Verified is off', async () => {
    const db = await seed({ verified_until: yesterday })
    vi.stubEnv('VERIFICATION_ENABLED', 'false')
    expect(await (await run()).json()).toEqual({ skipped: 'disabled' })
    expect(db.tables.seeker_verifications[0].status).toBe('approved')
  })
})

describe('sharing on apply', () => {
  it('records a share only from the applicant\'s own valid badge, and only what was ticked', async () => {
    const db = await seed()
    db.tables.verification_shares = []
    expect(await recordShare(db as never, 'application-2', 'profile-1', { police_record: true, right_to_work: false })).toBe(true)
    expect(db.tables.verification_shares[0]).toMatchObject({ application_id: 'application-2', verification_id: V, share_police_record: true, share_rtw: false })
    expect(await recordShare(db as never, 'application-3', 'profile-1', null)).toBe(false)
    expect(await recordShare(db as never, 'application-4', 'someone-without-a-badge', { police_record: true, right_to_work: true })).toBe(false)
    expect(db.tables.verification_shares).toHaveLength(1)
  })

  it('never shares from an expired badge and never blocks the application', async () => {
    const db = await seed({ verified_until: yesterday })
    db.tables.verification_shares = []
    expect(await recordShare(db as never, 'application-2', 'profile-1', { police_record: true, right_to_work: true })).toBe(false)
    db.failures['seeker_verifications.select'] = { code: 'XX000', message: 'down' }
    await expect(recordShare(db as never, 'application-2', 'profile-1', { police_record: true, right_to_work: true })).resolves.toBe(false)
  })

  it('gives the employer email one badge line, and none without a live share', async () => {
    const db = await seed()
    expect(await sharedEmailLine(db as never, 'application-1')).toMatch(/^This applicant is JobLink Verified: police record and right to work checked \d+ \w+ \d{4}\.$/)
    db.tables.verification_shares[0].revoked_at = 'x'
    expect(await sharedEmailLine(db as never, 'application-1')).toBeNull()
    expect(await sharedEmailLine(db as never, 'application-none')).toBeNull()
  })
})
