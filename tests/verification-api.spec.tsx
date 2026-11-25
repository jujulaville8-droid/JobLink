// @vitest-environment node
/**
 * Route-level guarantees for the free JobLink Verified right-to-work check,
 * with Supabase replaced by an in-memory fake: who may open a confirmation,
 * when uploads are accepted, what a decision does to the image, and the
 * daily job.
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
  emails: [] as { to: string; type: string; data?: Record<string, unknown> }[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }))
vi.mock('@/lib/email', () => ({
  BASE_URL: 'https://joblinkantigua.com',
  sendEmail: async (email: { to: string; type: string }) => { state.emails.push(email); return { success: true, id: 'email' } },
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

import { GET as openConfirmation } from '@/app/api/verification/documents/[shareId]/route'
import { POST as upload } from '@/app/api/verification/[id]/upload/route'
import { DELETE as removeBadge, GET as status } from '@/app/api/verification/route'
import { DELETE as stopSharing } from '@/app/api/verification/shares/[id]/route'
import { GET as preview } from '@/app/api/verification/preview/route'
import { GET as queue } from '@/app/api/admin/verifications/route'
import { POST as decide } from '@/app/api/admin/verifications/[id]/route'
import { GET as reviewFile } from '@/app/api/admin/verifications/[id]/file/route'
import { POST as openUploads } from '@/app/api/admin/verifications/settings/route'
import { GET as dailyJob } from '@/app/api/cron/verification-expiry/route'
import { storeDocument } from '@/lib/verification/files'
import { recordShare, sharedEmailLine } from '@/lib/verification/sharing'
import { CONSENT_VERSION, REVIEW_CHECKLIST, addMonths, antiguaToday } from '@/lib/verification/shared'

const V = '0b0f6a0e-1111-4222-8333-444455556666'
const SHARE = '0b0f6a0e-2222-4222-8333-444455556666'
const ORIGIN = 'https://joblinkantigua.com'
const today = antiguaToday()
const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

async function pdf(text = 'Passport') {
  const doc = await PDFDocument.create()
  doc.addPage([300, 400]).drawText(text)
  return Buffer.from(await doc.save())
}

function verification(overrides: Record<string, unknown> = {}) {
  return {
    id: V, seeker_id: 'profile-1', user_id: 'seeker-user', status: 'approved',
    consent_at: '2026-11-02T00:00:00Z', consent_version: CONSENT_VERSION,
    rtw_group_claimed: 'citizen', rtw_group: 'citizen', rtw_document_type: 'passport', rtw_document_expires_on: addMonths(today, 30),
    rtw_file_path: null, rtw_file_sha256: null, key_version: null,
    verified_until: addMonths(today, 24), confirmation_code: 'ABCDEFGH23',
    submitted_at: new Date().toISOString(), reviewed_at: new Date().toISOString(), reviewed_by: 'admin-user',
    decision_reason: null, expiry_reminder_sent_at: null, created_at: '2026-11-01T00:00:00Z',
    seeker_profiles: { first_name: 'Sam', last_name: 'Seeker' },
    ...overrides,
  }
}

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
  db.defaults.seeker_verifications = { status: 'draft' }
  state.db = db
  const row = verification(overrides) as Record<string, unknown>
  if (row.status === 'submitted' && !('rtw_file_path' in overrides)) {
    const stored = await storeDocument(db as never, V, 'rtw', await pdf())
    Object.assign(row, { rtw_file_path: stored.path, rtw_file_sha256: stored.sha256, key_version: 1 })
  }
  db.tables.seeker_verifications.push(row)
  db.tables.verification_shares.push({
    id: SHARE, application_id: 'application-1', verification_id: V, shared_at: '2026-11-10T12:00:00Z', revoked_at: null,
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
const confirmation = (share = SHARE) => openConfirmation(get(`/api/verification/documents/${share}`), { params: Promise.resolve({ shareId: share }) })

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('VERIFICATION_ENABLED', 'true')
  vi.stubEnv('VERIFICATION_FILE_KEY', randomBytes(32).toString('base64'))
  vi.stubEnv('VERIFICATION_FILE_KEY_VERSION', '1')
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  state.emails = []
  as('seeker-user')
})

describe('everything is off until switched on', () => {
  it('answers 404 on every route while VERIFICATION_ENABLED is off', async () => {
    await seed()
    vi.stubEnv('VERIFICATION_ENABLED', 'false')
    as('admin-user', { admin: true })
    const id = { params: Promise.resolve({ id: V }) }
    const responses = await Promise.all([
      status(), confirmation(), preview(), queue(),
      decide(json(`/api/admin/verifications/${V}`, { decision: 'not_approved', reason: 'name_mismatch' }), id),
      reviewFile(get(`/api/admin/verifications/${V}/file`), id),
      openUploads(json('/api/admin/verifications/settings', { upgraded: true })),
    ])
    expect(responses.map((response) => response.status)).toEqual(Array(7).fill(404))
  })
})

describe('an employer opening a shared confirmation', () => {
  it('gets the one-page confirmation, and the view is logged first', async () => {
    const db = await seed()
    as('employer-user')
    const response = await confirmation()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect((await PDFDocument.load(Buffer.from(await response.arrayBuffer()))).getPageCount()).toBe(1)
    expect(db.tables.verification_views).toEqual([expect.objectContaining({ share_id: SHARE, viewer_id: 'employer-user', company_id: 'company-1' })])
    expect(events('confirmation_opened_by_employer')).toHaveLength(1)
  })

  it.each([
    ['a different employer', async () => { await seed(); as('other-employer') }],
    ['the job seeker using the employer link', async () => { await seed(); as('seeker-user') }],
    ['sharing was stopped', async () => { await seed({}, { revoked_at: '2026-11-11T00:00:00Z' }); as('employer-user') }],
    ['the badge expired', async () => { await seed({ verified_until: yesterday }); as('employer-user') }],
    ['the badge was removed', async () => { await seed({ status: 'withdrawn' }); as('employer-user') }],
  ])('gets the same not-found when %s', async (_case, arrange) => {
    await arrange()
    const response = await confirmation()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
    expect(state.db.tables.verification_views).toHaveLength(0)
  })

  it('hands nothing over if the view cannot be logged', async () => {
    const db = await seed()
    db.failures['verification_views.insert'] = { code: 'XX000', message: 'down' }
    as('employer-user')
    expect((await confirmation()).status).toBe(503)
  })
})

describe('the job seeker stays in control', () => {
  it('sees their shares and who opened them, without file paths', async () => {
    const db = await seed()
    db.tables.verification_shares[0].verification_views = [{ viewed_at: '2026-11-12T10:00:00Z' }]
    const body = await (await status()).json()
    expect(body.shares[0]).toMatchObject({ employer: 'Acme Security', job_title: 'Security officer', views: [{ viewed_at: '2026-11-12T10:00:00Z' }] })
    expect(JSON.stringify(body)).not.toMatch(/\.enc|sha256|reviewed_by/)
  })

  it('can stop sharing, after which the employer is refused', async () => {
    await seed()
    expect((await stopSharing(json(`/api/verification/shares/${SHARE}`, {}, 'DELETE'), { params: Promise.resolve({ id: SHARE }) })).status).toBe(200)
    expect(events('sharing_stopped')).toHaveLength(1)
    as('employer-user')
    expect((await confirmation()).status).toBe(404)
  })

  it('can remove the badge, which stops every share', async () => {
    const db = await seed()
    expect((await removeBadge(json('/api/verification', {}, 'DELETE'))).status).toBe(200)
    expect(db.tables.seeker_verifications[0].status).toBe('withdrawn')
    expect(db.tables.verification_shares[0].revoked_at).not.toBeNull()
  })

  it('previews exactly what an employer sees', async () => {
    await seed()
    expect((await preview()).status).toBe(200)
  })

  it('refuses state-changing requests from another site, and is for job seekers only', async () => {
    await seed()
    expect((await removeBadge(json('/api/verification', {}, 'DELETE', 'https://evil.example'))).status).toBe(400)
    as('employer-user')
    expect((await status()).status).toBe(403)
  })
})

describe('uploading', () => {
  const send = async (id: string, fields: Record<string, string>, files: { name: string; bytes: Buffer }[]) => {
    const form = new FormData()
    for (const [key, value] of Object.entries({ consent: 'yes', consent_version: CONSENT_VERSION, ...fields })) if (value) form.set(key, value)
    for (const file of files) form.append('files', new File([new Uint8Array(file.bytes)], file.name))
    const request = new NextRequest(`${ORIGIN}/api/verification/${id}/upload`, { method: 'POST', body: form, headers: { origin: ORIGIN, host: 'joblinkantigua.com', 'x-forwarded-proto': 'https' } })
    return upload(request, { params: Promise.resolve({ id }) })
  }
  const fresh = async () => { const db = await seed(); db.tables.seeker_verifications = []; db.tables.verification_shares = []; return db }

  it('starts a free check, stores the image encrypted and sends it for review in one step', async () => {
    const db = await fresh()
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ccd' } }).jpeg().toBuffer()
    const response = await send('new', { group: 'citizen' }, [{ name: 'passport.jpg', bytes: photo }])
    expect(response.status).toBe(200)
    const row = db.tables.seeker_verifications[0]
    expect(row).toMatchObject({ status: 'submitted', rtw_group_claimed: 'citizen', consent_version: CONSENT_VERSION })
    expect(db.files.size).toBe(1)
    const [[name, bytes]] = [...db.files]
    expect(name).toMatch(new RegExp(`^${row.id}/rtw-[0-9a-f-]{36}\\.enc$`))
    expect(bytes.subarray(0, 4).toString()).toBe('JLV1')
    expect(JSON.stringify(await response.json())).not.toContain('.enc')
    expect(events('uploaded')).toHaveLength(1)
  })

  it('is refused while uploads are closed, without consent, without a name, or for the wrong type', async () => {
    const db = await fresh()
    db.tables.verification_settings[0].uploads_open = false
    expect((await (await send('new', { group: 'citizen' }, [{ name: 'p.pdf', bytes: await pdf() }])).json()).code).toBe('UPLOADS_LOCKED')
    db.tables.verification_settings[0].uploads_open = true
    expect((await (await send('new', { group: 'citizen', consent: '' }, [{ name: 'p.pdf', bytes: await pdf() }])).json()).code).toBe('CONSENT_REQUIRED')
    expect((await (await send('new', { group: 'citizen' }, [{ name: 'p.pdf', bytes: Buffer.from('PK\x03\x04 zip') }])).json()).code).toBe('FILE_REFUSED')
    db.tables.seeker_profiles[0].last_name = ''
    expect((await (await send('new', { group: 'citizen' }, [{ name: 'p.pdf', bytes: await pdf() }])).json()).code).toBe('NAME_REQUIRED')
    expect(db.files.size).toBe(0)
  })

  it('refuses a second check while one is open or the badge has months left', async () => {
    await seed({ status: 'submitted' })
    expect((await (await send('new', { group: 'citizen' }, [{ name: 'p.pdf', bytes: await pdf() }])).json()).code).toBe('IN_PROGRESS')
    await seed()
    expect((await (await send('new', { group: 'citizen' }, [{ name: 'p.pdf', bytes: await pdf() }])).json()).code).toBe('ALREADY_VERIFIED')
  })

  it('sends the document again on an existing check when asked', async () => {
    const db = await seed({ status: 'reupload_needed', decision_reason: 'photo_unreadable', rtw_group: null, verified_until: null, confirmation_code: null })
    expect((await send(V, {}, [{ name: 'p.pdf', bytes: await pdf() }])).status).toBe(200)
    expect(db.tables.seeker_verifications[0]).toMatchObject({ status: 'submitted', decision_reason: null })
  })

  it('leaves no file behind when the record cannot be saved', async () => {
    const db = await fresh()
    db.failures['seeker_verifications.update'] = { code: 'XX000', message: 'down' }
    expect((await send('new', { group: 'citizen' }, [{ name: 'p.pdf', bytes: await pdf() }])).status).toBe(503)
    expect(db.files.size).toBe(0)
  })
})

describe('admin review', () => {
  const id = { params: Promise.resolve({ id: V }) }
  const approve = (overrides: Record<string, unknown> = {}) => json(`/api/admin/verifications/${V}`, {
    decision: 'approve', rtw_group: 'citizen', rtw_document_type: 'passport', rtw_document_expires_on: addMonths(today, 12),
    checklist: REVIEW_CHECKLIST.map((item) => item.id), ...overrides,
  })
  const submitted = () => seed({ status: 'submitted', rtw_group: null, rtw_document_type: null, verified_until: null, confirmation_code: null, reviewed_at: null })

  it.each([
    ['a job seeker', () => as('seeker-user'), 403],
    ['a signed-out visitor', () => as(null), 401],
    ['an admin without two-step login', () => as('admin-user', { admin: true, twoStep: false }), 403],
  ])('refuses %s on every admin route', async (_who, arrange, expected) => {
    const db = await submitted()
    arrange()
    const responses = await Promise.all([queue(), decide(approve(), id), reviewFile(get(`/api/admin/verifications/${V}/file`), id), openUploads(json('/api/admin/verifications/settings', { upgraded: true }))])
    expect(responses.map((response) => response.status)).toEqual(Array(4).fill(expected))
    expect(db.tables.seeker_verifications[0].status).toBe('submitted')
  })

  it('streams the image to the reviewer and logs the open against them; not once decided', async () => {
    await submitted()
    as('admin-user', { admin: true })
    const response = await reviewFile(get(`/api/admin/verifications/${V}/file`), id)
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
    expect(events('file_opened_by_reviewer')).toEqual([expect.objectContaining({ actor_id: 'admin-user' })])
    await seed()
    expect((await reviewFile(get(`/api/admin/verifications/${V}/file`), id)).status).toBe(404)
  })

  it('approves: the badge lasts until the document expires, and the image is deleted', async () => {
    const db = await submitted()
    as('admin-user', { admin: true })
    expect((await decide(approve(), id)).status).toBe(200)
    const row = db.tables.seeker_verifications[0]
    expect(row).toMatchObject({ status: 'approved', verified_until: addMonths(today, 12), rtw_file_path: null, reviewed_by: 'admin-user' })
    expect(row.confirmation_code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect(db.files.size).toBe(0)
    expect(state.emails).toEqual([expect.objectContaining({ type: 'verification_approved', data: expect.objectContaining({ verified_line: 'Verified eligible to work in Antigua' }) })])
  })

  it('caps the badge at two years, and needs a permit\'s expiry date', async () => {
    const db = await submitted()
    as('admin-user', { admin: true })
    expect((await decide(approve({ rtw_group: 'work_permit', rtw_document_type: 'work_permit', rtw_document_expires_on: null }), id)).status).toBe(409)
    expect((await decide(approve({ rtw_document_expires_on: addMonths(today, 60) }), id)).status).toBe(200)
    expect(db.tables.seeker_verifications[0].verified_until).toBe(addMonths(today, 24))
  })

  it.each([
    ['the checklist is incomplete', { checklist: ['name'] }, 400],
    ['the document has expired', { rtw_document_expires_on: yesterday }, 409],
    ['the document type does not fit the group', { rtw_document_type: 'work_permit' }, 409],
    ['there is a free-text field', { notes: 'anything' }, 400],
  ])('will not approve when %s', async (_case, overrides, expected) => {
    const db = await submitted()
    as('admin-user', { admin: true })
    expect((await decide(approve(overrides), id)).status).toBe(expected)
    expect(db.tables.seeker_verifications[0].status).toBe('submitted')
    expect(db.files.size).toBe(1)
  })

  it('asks again or refuses with a reason from the list, deleting the image either way', async () => {
    for (const [decision, statusAfter, emailType] of [['reupload', 'reupload_needed', 'verification_reupload'], ['not_approved', 'not_approved', 'verification_not_approved']] as const) {
      const db = await submitted()
      state.emails = []
      as('admin-user', { admin: true })
      const reason = decision === 'reupload' ? 'photo_unreadable' : 'name_mismatch'
      expect((await decide(json(`/api/admin/verifications/${V}`, { decision, reason }), id)).status).toBe(200)
      expect(db.tables.seeker_verifications[0]).toMatchObject({ status: statusAfter, decision_reason: reason, rtw_file_path: null })
      expect(db.files.size).toBe(0)
      expect(state.emails[0].type).toBe(emailType)
    }
  })

  it('a decision cannot be made twice', async () => {
    await seed()
    as('admin-user', { admin: true })
    expect((await decide(approve(), id)).status).toBe(409)
  })

  it('opens uploads once, only with confirmation and the file key', async () => {
    const db = await seed()
    db.tables.verification_settings[0] = { uploads_open: false, opened_at: null }
    as('admin-user', { admin: true })
    expect((await openUploads(json('/api/admin/verifications/settings', { upgraded: false }))).status).toBe(400)
    vi.stubEnv('VERIFICATION_FILE_KEY', '')
    expect((await openUploads(json('/api/admin/verifications/settings', { upgraded: true }))).status).toBe(409)
    vi.stubEnv('VERIFICATION_FILE_KEY', randomBytes(32).toString('base64'))
    expect((await openUploads(json('/api/admin/verifications/settings', { upgraded: true }))).status).toBe(200)
    expect(db.tables.verification_settings[0]).toMatchObject({ uploads_open: true, opened_by: 'admin-user' })
  })
})

describe('the daily job', () => {
  const run = (secret = 'cron-secret') => dailyJob(new NextRequest(`${ORIGIN}/api/cron/verification-expiry`, { headers: { authorization: `Bearer ${secret}` } }))

  it('needs the cron secret', async () => {
    await seed()
    expect((await run('wrong')).status).toBe(401)
  })

  it('ends a badge past its end date and says so; leaves valid ones alone', async () => {
    const db = await seed({ verified_until: yesterday })
    db.tables.seeker_verifications.push(verification({ id: 'still-valid', user_id: 'other', seeker_id: 'profile-9', expiry_reminder_sent_at: 'sent' }))
    const result = await (await run()).json()
    expect(result.expired).toBe(1)
    expect(db.tables.seeker_verifications[0].status).toBe('expired')
    expect(db.tables.seeker_verifications[1].status).toBe('approved')
    expect(state.emails).toEqual([expect.objectContaining({ type: 'verification_expired' })])
  })

  it('reminds 30 days before, once', async () => {
    await seed({ verified_until: new Date(Date.parse(`${today}T00:00:00Z`) + 20 * 86_400_000).toISOString().slice(0, 10) })
    expect((await (await run()).json()).reminders).toBe(1)
    expect((await (await run()).json()).reminders).toBe(0)
  })

  it('sweeps images nothing points at, and only those', async () => {
    const db = await seed({ status: 'submitted' })
    db.files.set(`${V}/rtw-orphan.enc`, Buffer.from('left behind'))
    const kept = db.tables.seeker_verifications[0].rtw_file_path as string
    expect((await (await run()).json()).swept).toBe(1)
    expect([...db.files.keys()]).toEqual([kept])
  })
})

describe('sharing on apply', () => {
  it('records a share only from the applicant\'s own valid badge, and only when ticked', async () => {
    const db = await seed()
    db.tables.verification_shares = []
    expect(await recordShare(db as never, 'application-2', 'profile-1', true)).toBe(true)
    expect(db.tables.verification_shares[0]).toMatchObject({ application_id: 'application-2', verification_id: V })
    expect(await recordShare(db as never, 'application-3', 'profile-1', false)).toBe(false)
    expect(await recordShare(db as never, 'application-4', 'someone-without-a-badge', true)).toBe(false)
    expect(db.tables.verification_shares).toHaveLength(1)
  })

  it('never shares from an expired badge and never blocks the application', async () => {
    const db = await seed({ verified_until: yesterday })
    db.tables.verification_shares = []
    expect(await recordShare(db as never, 'application-2', 'profile-1', true)).toBe(false)
    db.failures['seeker_verifications.select'] = { code: 'XX000', message: 'down' }
    await expect(recordShare(db as never, 'application-2', 'profile-1', true)).resolves.toBe(false)
  })

  it('gives the employer email one badge line with the right wording', async () => {
    const db = await seed()
    expect(await sharedEmailLine(db as never, 'application-1')).toMatch(/^Verified eligible to work in Antigua \(checked by JobLink \d+ \w+ \d{4}\)\.$/)
    ;(db.tables.verification_shares[0].seeker_verifications as Record<string, unknown>).rtw_group = 'work_permit'
    expect(await sharedEmailLine(db as never, 'application-1')).toMatch(/^Verified: holds an Antigua work permit/)
    db.tables.verification_shares[0].revoked_at = 'x'
    expect(await sharedEmailLine(db as never, 'application-1')).toBeNull()
  })
})
