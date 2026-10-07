// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), storageFrom: vi.fn(), download: vi.fn(), send: vi.fn(), fetchCv: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from, storage: { from: mocks.storageFrom } }) }))
vi.mock('@/lib/email', () => ({ sendEmail: mocks.send }))
vi.mock('@/lib/cv-helpers', () => ({ fetchFullCv: mocks.fetchCv }))
import { applicantCvPath, notifyNewApplicant } from '../src/lib/applicant-notifications'
import { buildEmailHtml } from '../src/lib/email-templates'
import { resumeFixture } from './fixtures/resume'

const uid = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
let rows: Record<string, Record<string, unknown> | null>
const queries: { table: string; filters: [string, unknown][] }[] = []
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'test-only-no-delivery')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  queries.length = 0
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
    const q = { select: () => q, eq: (field: string, value: unknown) => { filters.push([field, value]); return q }, single: async () => {
      const row = rows[table === 'users' ? (filters.some(([, v]) => v === 'owner') ? 'owner' : 'applicant') : table]
      return { data: row && filters.every(([k, v]) => row[k] === v) ? row : null, error: null }
    } }
    return q
  })
  mocks.storageFrom.mockReturnValue({ download: mocks.download })
  mocks.download.mockResolvedValue({ data: new Blob(['%PDF-1.7\nfixture']), error: null })
  mocks.send.mockResolvedValue({ success: true, id: 'provider-id' })
  mocks.fetchCv.mockResolvedValue(null)
})

it('binds saved application to applicant and company; sends private bytes only to saved real contact', async () => {
  expect(await notifyNewApplicant('saved-app', uid)).toBe(true)
  expect(queries).toContainEqual({ table: 'seeker_profiles', filters: [['id', 'seeker'], ['user_id', uid]] })
  expect(mocks.storageFrom).toHaveBeenCalledWith('cvs')
  expect(mocks.download).toHaveBeenCalledWith(`${uid}/cv-1.pdf`)
  const params = mocks.send.mock.calls[0][0]
  expect(params).toMatchObject({ to: 'emanousou@nobuhotels.com', replyTo: 'applicant@example.test', idempotencyKey: 'application/saved-app/employer', data: { applicant_name: 'Applicant <Name>', applicant_phone: '+1 268 555 0100', cv_attached: true, review_path: null } })
  expect(params.data.cover_letter_excerpt).toHaveLength(1500)
  expect(params.attachments).toEqual([{ filename: 'Applicant-CV.pdf', content: Buffer.from('%PDF-1.7\nfixture'), contentType: 'application/pdf' }])
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

it.each([null, new Blob(['not a PDF']), new Blob(['%PDF-' + 'x'.repeat(5 * 1024 * 1024)])])('omits missing, invalid or oversized CVs; notification stays useful', async file => {
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
