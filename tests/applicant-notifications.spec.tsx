// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), storageFrom: vi.fn(), download: vi.fn(), send: vi.fn(), fetchCv: vi.fn(), screen: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from, storage: { from: mocks.storageFrom } }) }))
vi.mock('@/lib/email', () => ({ sendEmail: mocks.send }))
vi.mock('@/lib/cv-helpers', () => ({ fetchFullCv: mocks.fetchCv }))
vi.mock('@/lib/employer-screening/inline', async importOriginal => ({ ...await importOriginal<object>(), inlineEmployerScreening: mocks.screen }))
import { applicantCvPath, notifyNewApplicant } from '../src/lib/applicant-notifications'
import { buildEmailHtml } from '../src/lib/email-templates'
import { resumeFixture } from './fixtures/resume'
import { syntheticReviewReport } from './fixtures/resume-review-v2'
import { INLINE_SCREENING_GATES } from '../src/lib/employer-screening/inline'
import { SCREENING_NOTICE_VERSION } from '../src/lib/employer-screening/notice'

const uid = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
let rows: Record<string, Record<string, unknown> | null>
const queries: { table: string; filters: [string, unknown][] }[] = []
const updates: { table: string; value: Record<string, unknown> }[] = []
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.stubEnv('RESEND_API_KEY', 'test-only-no-delivery')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('EMPLOYER_SCREENING_INLINE_ENABLED', 'false')
  queries.length = 0
  updates.length = 0
  rows = {
    applications: { id: 'saved-app', job_id: jobId, seeker_id: 'seeker', cover_letter_text: '<script>alert(1)</script>' + 'x'.repeat(2000) },
    seeker_profiles: { id: 'seeker', user_id: uid, first_name: 'Applicant', last_name: '<Name>', phone: '+1 268 555 0100', cv_url: `${uid}/cv-1.pdf` },
    job_listings: { id: jobId, company_id: 'company', title: 'Cook' },
    companies: { id: 'company', user_id: 'owner', company_name: 'Cafe', contact_email: ' EMANOUSOU@NOBUHOTELS.COM ' },
    owner: { id: 'owner', email: 'admin-company-12@joblinkantigua.com', email_verified: true, is_banned: false },
    applicant: { id: uid, email: 'applicant@example.test', is_banned: false },
  }
  mocks.from.mockImplementation((table: string) => {
    const filters: [string, unknown][] = []
    queries.push({ table, filters })
    const q = { update: (value: Record<string, unknown>) => { updates.push({ table, value }); return q }, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve), select: () => q, eq: (field: string, value: unknown) => { filters.push([field, value]); return q }, single: async () => {
      const row = rows[table === 'users' ? (filters.some(([, v]) => v === 'owner') ? 'owner' : 'applicant') : table]
      return { data: row && filters.every(([k, v]) => row[k] === v) ? row : null, error: null }
    } }
    return q
  })
  mocks.storageFrom.mockReturnValue({ download: mocks.download })
  mocks.download.mockResolvedValue({ data: new Blob(['%PDF-1.7\nfixture']), error: null })
  mocks.send.mockResolvedValue({ success: true, id: 'provider-id' })
  mocks.fetchCv.mockResolvedValue(null)
  mocks.screen.mockResolvedValue({})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('keeps the identical original email when inline screening is OFF, undisclosed, or fails', async () => {
  await notifyNewApplicant('saved-app', uid, SCREENING_NOTICE_VERSION)
  const baseline = mocks.send.mock.calls[0][0]
  expect(mocks.screen).not.toHaveBeenCalled()
  INLINE_SCREENING_GATES.forEach(key => vi.stubEnv(key, 'true'))
  await notifyNewApplicant('saved-app', uid)
  await notifyNewApplicant('saved-app', uid, 'stale-notice')
  expect(mocks.screen).not.toHaveBeenCalled()
  mocks.screen.mockRejectedValue(new Error('private CV/secret failure'))
  await notifyNewApplicant('saved-app', uid, SCREENING_NOTICE_VERSION)
  expect(mocks.screen).toHaveBeenCalledOnce()
  expect(mocks.send).toHaveBeenCalledTimes(4)
  for (const [message] of mocks.send.mock.calls) expect(message).toEqual(baseline)
})

it.each(['upload', 'builder'])('screens the exact %s attachment Buffer once, before the unchanged one-email send', async kind => {
  INLINE_SCREENING_GATES.forEach(key => vi.stubEnv(key, 'true'))
  if (kind === 'builder') {
    rows.seeker_profiles!.cv_url = null
    mocks.fetchCv.mockResolvedValue({ ...resumeFixture, profile: { ...resumeFixture.profile, user_id: uid } })
  }
  mocks.screen.mockResolvedValue({ employer_screening: { status: 'unavailable' } })
  expect(await notifyNewApplicant('saved-app', uid, SCREENING_NOTICE_VERSION)).toBe(true)
  expect(mocks.screen).toHaveBeenCalledOnce()
  expect(mocks.send).toHaveBeenCalledOnce()
  const input = mocks.screen.mock.calls[0][0], message = mocks.send.mock.calls[0][0]
  expect(input.resumeBytes).toBe(message.attachments[0].content)
  expect(input).toMatchObject({ applicationId: 'saved-app', applicantUserId: uid, jobId, companyId: 'company', noticeVersion: SCREENING_NOTICE_VERSION })
  expect(input).not.toHaveProperty('coverLetter')
  expect(input).not.toHaveProperty('applicantEmail')
  expect(message).toMatchObject({ idempotencyKey: 'application/saved-app/employer', replyTo: 'applicant@example.test',
    data: { employer_screening: { status: 'unavailable' }, cv_attached: true } })
  expect(mocks.screen.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0])
  expect(mocks.download).toHaveBeenCalledTimes(kind === 'upload' ? 1 : 0)
  expect(mocks.fetchCv).toHaveBeenCalledTimes(kind === 'builder' ? 1 : 0)
  expect(vi.mocked(console.info).mock.calls.some(call => String(call[1]).includes('attachment_ready'))).toBe(true)
})

it('does not run screening without an attachment, even with every inline gate enabled', async () => {
  INLINE_SCREENING_GATES.forEach(key => vi.stubEnv(key, 'true'))
  mocks.download.mockResolvedValue({ data: null, error: null })
  expect(await notifyNewApplicant('saved-app', uid, SCREENING_NOTICE_VERSION)).toBe(true)
  expect(mocks.screen).not.toHaveBeenCalled()
  expect(mocks.send).toHaveBeenCalledOnce()
  expect(vi.mocked(console.info).mock.calls.some(call => String(call[1]).includes('attachment_missing'))).toBe(true)
})

it('binds saved application to applicant and company; sends private bytes only to saved real contact', async () => {
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(queries).toContainEqual({ table: 'seeker_profiles', filters: [['id', 'seeker'], ['user_id', uid]] })
  expect(mocks.storageFrom).toHaveBeenCalledWith('cvs')
  expect(mocks.download).toHaveBeenCalledWith(`${uid}/cv-1.pdf`)
  const params = mocks.send.mock.calls[0][0]
  expect(params).toMatchObject({ to: 'emanousou@nobuhotels.com', replyTo: 'applicant@example.test', idempotencyKey: 'application/saved-app/employer', data: { applicant_name: 'Applicant <Name>', applicant_phone: '+1 268 555 0100', cv_attached: true, review_path: null } })
  expect(params.data.cover_letter_excerpt).toHaveLength(1500)
  expect(params.attachments).toEqual([{ filename: 'Applicant Name Resume.pdf', content: Buffer.from('%PDF-1.7\nfixture'), contentType: 'application/pdf' }])
  expect(JSON.stringify(params)).not.toMatch(/storage\/v1|signedUrl|token=/)
})

it('falls back to real owner email when contact is missing; exposes only that owner’s working dashboard', async () => {
  rows.companies!.contact_email = null
  rows.owner!.email = 'owner@example.test'
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.test', data: expect.objectContaining({ review_path: `/my-listings/${jobId}/applicants` }) }))
})

it.each(['bad address', 'one@example.test,two@example.test', 'x@example.test\r\nBcc: leak@example.test', 'admin-company-1@joblinkantigua.com', 'import+fixture-company@joblinkantigua.com'])('fails closed for invalid saved contact %s', async contact => {
  rows.companies!.contact_email = contact
  rows.owner!.email = 'owner@example.test'
  expect(await notifyNewApplicant('saved-app', uid)).toBe(false)
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})

it.each(['admin-company-12@joblinkantigua.com', 'import+fixture-company@joblinkantigua.com', ' IMPORT+FIXTURE-COMPANY@JOBLINKANTIGUA.COM '])('never falls back to placeholder %s or downloads for a mismatched application user', async ownerEmail => {
  rows.companies!.contact_email = null
  rows.owner!.email = ownerEmail
  expect(await notifyNewApplicant('saved-app', uid)).toBe(false)
  rows.companies!.contact_email = 'owner@example.test'
  expect(await notifyNewApplicant('saved-app', 'someone-else')).toBe(false)
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})

it('uses a real explicit contact for a legacy imported owner without a placeholder dashboard', async () => {
  rows.owner!.email = 'import+fixture-company@joblinkantigua.com'
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: 'emanousou@nobuhotels.com', data: { cv_attached: true, review_path: null } })
})

it('preserves legitimate plus-addressed owner mailboxes outside reserved placeholder formats', async () => {
  rows.companies!.contact_email = null
  rows.owner!.email = 'import+recruiting@example.test'
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: 'import+recruiting@example.test', data: { review_path: `/my-listings/${jobId}/applicants` } })
})

it('requires a verified owner account for email fallback; explicit admin contact remains usable', async () => {
  rows.companies!.contact_email = null
  rows.owner!.email = 'owner@example.test'
  rows.owner!.email_verified = false
  expect(await notifyNewApplicant('saved-app', uid)).toBe(false)
  expect(mocks.download).not.toHaveBeenCalled()
  rows.companies!.contact_email = 'owner@example.test'
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.send.mock.calls[0][0].data.review_path).toBeNull()
})

it.each(['owner', 'applicant'])('does not send private details for a banned %s', async key => {
  rows[key]!.is_banned = true
  expect(await notifyNewApplicant('saved-app', uid)).toBe(false)
  expect(mocks.send).not.toHaveBeenCalled()
})

it.each([`${uid}/../someone/cv.pdf`, 'someone-else/cv.pdf', `${uid}/%2e%2e.pdf`, `https://evil.test/storage/v1/object/public/cvs/${uid}/cv.pdf`, `https://example.supabase.co/storage/v1/object/public/avatars/${uid}/cv.pdf`])('omits unsafe CV without fetching it: %s', async path => {
  rows.seeker_profiles!.cv_url = path
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ attachments: [], data: { cv_attached: false } })
})

it('normalizes only same-project legacy CV URLs within the applicant folder', () => {
  expect(applicantCvPath(`https://example.supabase.co/storage/v1/object/public/cvs/${uid}/cv.pdf`, uid)).toBe(`${uid}/cv.pdf`)
  expect(applicantCvPath(`https://example.supabase.co/storage/v1/object/sign/cvs/${uid}/cv.pdf?token=private`, uid)).toBe(`${uid}/cv.pdf`)
  expect(applicantCvPath(`https://example.supabase.co/storage/v1/object/public/cvs/${uid}/%2fother.pdf`, uid)).toBeNull()
})

it.each([null, new Blob(['not a PDF']), new Blob(['%PDF-' + 'x'.repeat(10 * 1024 * 1024)])])('omits missing, invalid or oversized CVs; notification stays useful', async file => {
  mocks.download.mockResolvedValue({ data: file, error: file ? null : { message: 'unavailable' } })
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ attachments: [], data: { applicant_email: 'applicant@example.test', cv_attached: false } })
})

it('skips all database/file reads without provider key and survives storage exceptions without private logs', async () => {
  vi.stubEnv('RESEND_API_KEY', '')
  expect(await notifyNewApplicant('saved-app', uid)).toBe(false)
  expect(mocks.from).not.toHaveBeenCalled()
  vi.stubEnv('RESEND_API_KEY', 'test-only')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.download.mockRejectedValue(new Error('private storage token=secret'))
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(JSON.stringify(warn.mock.calls)).not.toContain('secret')
  warn.mockRestore()
})

it('renders the applicant’s built resume to private PDF bytes when there is no upload', async () => {
  rows.seeker_profiles!.cv_url = null
  mocks.fetchCv.mockResolvedValue({ ...resumeFixture, profile: { ...resumeFixture.profile, user_id: uid } })
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.fetchCv).toHaveBeenCalledWith(uid, true)
  const attachment = mocks.send.mock.calls[0][0].attachments[0]
  expect(attachment.content.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  expect(attachment.content.length).toBeGreaterThan(1000)
  expect(mocks.download).not.toHaveBeenCalled()
})

it('does not attach a built resume for another profile or manufacture a missing one', async () => {
  rows.seeker_profiles!.cv_url = null
  mocks.fetchCv.mockResolvedValue(resumeFixture)
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.send.mock.calls[0][0].attachments).toEqual([])
  mocks.fetchCv.mockResolvedValue(null)
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.send.mock.calls[1][0].attachments).toEqual([])
})

it('escapes applicant content, says when CV unavailable, and hides unusable dashboard links', () => {
  const html = buildEmailHtml('new_applicant', { applicant_name: '<Applicant>', applicant_email: '<contact>', applicant_phone: '<phone>', cover_letter_excerpt: '<script>bad()</script>', cv_attached: false }).html
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('CV attachment is unavailable')
  expect(html).not.toContain('Review Applicant')
  expect(html).not.toContain('<script>')
  expect(buildEmailHtml('new_applicant', { review_path: 'https://evil.test' }).html).not.toContain('evil.test')
  expect(buildEmailHtml('new_applicant', { cv_attached: true, review_path: `/my-listings/${jobId}/applicants` }).html).toContain(`https://joblinkantigua.com/my-listings/${jobId}/applicants`)
})

it('records for admins whether the application was forwarded, without recipient details', async () => {
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(updates).toEqual([{ table: 'applications', value: {
    employer_forward_status: 'sent',
    employer_forward_attempted_at: expect.any(String),
    employer_forwarded_at: expect.any(String),
  } }])
  mocks.send.mockResolvedValue({ success: false })
  updates.length = 0
  expect(await notifyNewApplicant('saved-app', uid)).toBe(false)
  expect(updates).toEqual([{ table: 'applications', value: { employer_forward_status: 'not_sent', employer_forward_attempted_at: expect.any(String) } }])
})

// Offline response fixture only; the provider and transport are not called here.
it('includes the validated v2 review in the original single email and unchanged attachment/idempotency key', async () => {
  INLINE_SCREENING_GATES.forEach(key => vi.stubEnv(key, 'true'))
  mocks.screen.mockResolvedValue({ employer_resume_review_v2: syntheticReviewReport() })
  expect(await notifyNewApplicant('saved-app', uid, SCREENING_NOTICE_VERSION)).toBe(true)
  expect(mocks.screen).toHaveBeenCalledOnce(); expect(mocks.send).toHaveBeenCalledOnce()
  const message = mocks.send.mock.calls[0][0]
  expect(message.idempotencyKey).toBe('application/saved-app/employer')
  expect(message.attachments[0].content).toBe(mocks.screen.mock.calls[0][0].resumeBytes)
  expect(message.data.employer_resume_review_v2.roleFitScore.value).toBe(4)
  expect(message.data).not.toHaveProperty('employer_screening')
  expect(message.data).not.toHaveProperty('employer_resume_quality')
  const html = buildEmailHtml('new_applicant', message.data).html
  expect(html).toContain('Gaps for this role'); expect(html).not.toMatch(/unresolved|3\.125/)
})

it.each([
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['jpg', 'image/jpeg'], ['png', 'image/png'], ['heic', 'image/heic'],
])('forwards an accepted %s with its correct filename and content type', async (extension, contentType) => {
  rows.seeker_profiles!.cv_url = `${uid}/cv-1.${extension}`
  mocks.download.mockResolvedValue({ data: new Blob(['fixture']), error: null })
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(mocks.send.mock.calls[0][0].attachments).toEqual([
    { filename: `Applicant Name Resume.${extension}`, content: Buffer.from('fixture'), contentType },
  ])
})
