// @vitest-environment node
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inlineEmployerScreening, INLINE_SCREENING_GATES, INLINE_SCREENING_BUDGET_MS, type InlineScreeningDependencies } from '../src/lib/employer-screening/inline'
import { SOL_REVIEW_MODEL, type SolReviewBudgetStore } from '../src/lib/employer-screening/review-v2-provider'
import { SCREENING_NOTICE_VERSION } from '../src/lib/employer-screening/notice'
import { reservedCostMicrousd } from '../src/lib/employer-screening/provider'
import { buildEmailHtml } from '../src/lib/email-templates'
import { SYNTHETIC_REVIEW_PAGE, syntheticReviewContext, syntheticReviewRaw } from './fixtures/resume-review-v2'
import { builderScreeningFixture } from './fixtures/builder-screening'
import { renderBuilderResume } from '../src/lib/employer-screening/builder-render'
const delivery = vi.hoisted(() => ({ from: vi.fn(), download: vi.fn(), send: vi.fn(), dependencies: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: delivery.from,
  storage: { from: () => ({ download: delivery.download }) } }) }))
vi.mock('@/lib/email', () => ({ sendEmail: delivery.send }))
vi.mock('@/lib/employer-screening/inline', async importOriginal => ({ ...await importOriginal<object>(),
  inlineScreeningDependencies: delivery.dependencies }))
import { notifyNewApplicant } from '../src/lib/applicant-notifications'
const app = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222'
const reservation = '33333333-3333-4333-8333-333333333333'
const bytes = Buffer.from('synthetic parser-injection fixture only')
const hash = (input: Uint8Array) => createHash('sha256').update(input).digest('hex')
const input = (resumeBytes: Uint8Array = bytes) => ({ applicationId: app, applicantUserId: user, jobId: 'synthetic-job', companyId: 'synthetic-company',
  jobTitle: 'Outbound Sales Representative', noticeVersion: SCREENING_NOTICE_VERSION, resumeBytes })
const job = { id: 'synthetic-job', company_id: 'synthetic-company', title: 'Outbound Sales Representative', status: 'active',
  description: `Responsibilities\n${syntheticReviewContext().rubric.map(row => `- ${row.requirement}`).join('\n')}` }
function setup(response = syntheticReviewRaw()) {
  const reviewBudget: SolReviewBudgetStore = { claim: vi.fn(async () => true), countAllowed: vi.fn(() => true),
    reserve: vi.fn(async request => ({ reservation_id: reservation, model: SOL_REVIEW_MODEL, input_token_ceiling: request.inputTokenCount,
      max_output_tokens: 2048, input_microusd_per_million: 5_500_000, output_microusd_per_million: 16_500_000,
      reserved_microusd: reservedCostMicrousd(request.inputTokenCount, 2048, 5_500_000, 16_500_000),
      request_sha256: request.requestSha256, config_id: request.configId, reasoning_effort: 'low', service_tier: 'default',
      token_count_source: 'responses_input_tokens', dispatch_not_after: new Date(Date.now() + 25_000).toISOString() })),
    dispatchAllowed: vi.fn(() => true), settle: vi.fn(async () => true) }
  const fetcher = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url).endsWith('/input_tokens') ? { object: 'response.input_tokens', input_tokens: 1200 }
    : { id: 'resp_synthetic_v2', model: SOL_REVIEW_MODEL, service_tier: 'default', status: 'completed', error: null, incomplete_details: null,
      output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(response) }] }],
      usage: { input_tokens: 1200, output_tokens: 900, total_tokens: 2100,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 100 } } })))
  const deps: { -readonly [K in keyof InlineScreeningDependencies]: InlineScreeningDependencies[K] } = { loadJob: vi.fn(async () => job), budget: vi.fn(() => { throw new Error('Luna must not run') }),
    reviewBudget: vi.fn(() => reviewBudget), fetch: fetcher,
    extract: vi.fn(async b => ({ sourceSha256: hash(b), evidence: [], context: [], omittedContext: true, localPages: [SYNTHETIC_REVIEW_PAGE] })),
    env: { ...Object.fromEntries(INLINE_SCREENING_GATES.map(key => [key, 'true'])),
      EMPLOYER_SCREENING_REVIEW_V2_ENABLED: 'true', EMPLOYER_SCREENING_REVIEW_V2_PRIVACY_APPROVED: 'true',
      EMPLOYER_SCREENING_REVIEW_V2_BUDGET_CONFIG_ID: 'gpt-6.1-sol-20261022-counted-v2', EMPLOYER_SCREENING_PAID_PROVIDER_ENABLED: 'true',
      EMPLOYER_SCREENING_BUDGET_APPROVED: 'true', OPENAI_API_KEY: 'synthetic-not-a-key' } }
  return { deps, reviewBudget, fetcher }
}
beforeEach(() => {
  Object.values(delivery).forEach(mock => mock.mockReset())
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('exclusive Sol v2 original-email enrichment, offline provider and ledger mocks', () => {
  it('uses broader professional text despite zero legacy evidence and renders a validated compact review', async () => {
    const s = setup(), fields = await inlineEmployerScreening(input(), s.deps)
    expect(fields.employer_resume_review_v2).toMatchObject({ qualityScore: { value: 8 }, roleFitScore: { value: 4 } })
    expect(fields).not.toHaveProperty('employer_screening'); expect(fields).not.toHaveProperty('employer_resume_quality')
    expect(s.deps.budget).not.toHaveBeenCalled(); expect(s.fetcher).toHaveBeenCalledTimes(2)
    expect(s.reviewBudget.claim).toHaveBeenCalledOnce(); expect(s.reviewBudget.reserve).toHaveBeenCalledOnce()
    expect(s.reviewBudget.settle).toHaveBeenCalledOnce()
    const request = JSON.parse(String(s.fetcher.mock.calls[1][1]!.body))
    expect(request.model).toBe(SOL_REVIEW_MODEL)
    expect(JSON.stringify(request)).not.toContain('Jordan Ellis')
    expect(JSON.stringify(request)).toContain('Answered customer enquiries')
    const html = buildEmailHtml('new_applicant', { ...fields, applicant_name: 'Fictional Applicant', job_title: job.title, cv_attached: true }).html
    expect(html).toContain('8/10'); expect(html).toContain('4/10'); expect(html).toContain('Gaps for this role')
    expect(html).not.toMatch(/unresolved|3\.125|AI.assessed|AI.reviewed/)
  })
  it.each(['EMPLOYER_SCREENING_REVIEW_V2_PRIVACY_APPROVED', 'EMPLOYER_SCREENING_BUDGET_APPROVED', 'EMPLOYER_SCREENING_PAID_PROVIDER_ENABLED'])('never calls either model without %s', async gate => {
    const s = setup(); s.deps.env![gate] = 'false'
    expect(await inlineEmployerScreening(input(), s.deps)).toEqual({})
    expect(s.fetcher).not.toHaveBeenCalled(); expect(s.deps.budget).not.toHaveBeenCalled()
  })
  it('requires the updated disclosure for broader processing; old linked forms still get baseline', async () => {
    const s = setup(); expect(await inlineEmployerScreening({ ...input(), noticeVersion: 'resume-advisory-terms-link-v2' }, s.deps)).toEqual({})
    expect(s.fetcher).not.toHaveBeenCalled(); expect(s.deps.budget).not.toHaveBeenCalled()
  })
  it('falls back to original email fields on count failure, with no paid Luna fallback', async () => {
    const s = setup(); s.fetcher.mockRejectedValue(new Error('Synthetic count transport failure'))
    const fields = await inlineEmployerScreening(input(), s.deps)
    expect(fields).toEqual({})
    expect(buildEmailHtml('new_applicant', { ...fields, cv_attached: true }).html).not.toMatch(/\d+\/10|unresolved|3\.125/)
    expect(s.fetcher).toHaveBeenCalledOnce(); expect(s.deps.budget).not.toHaveBeenCalled(); expect(s.reviewBudget.reserve).not.toHaveBeenCalled()
  })
  it('rejects admission before any provider request, including counting', async () => {
    const s = setup(); vi.mocked(s.reviewBudget.claim).mockResolvedValue(false)
    expect(await inlineEmployerScreening(input(), s.deps)).toEqual({}); expect(s.fetcher).not.toHaveBeenCalled()
  })
  it('logs a distinct admission_denied diagnostic when the claim refuses', async () => {
    const s = setup(); vi.mocked(s.reviewBudget.claim).mockResolvedValue(false)
    expect(await inlineEmployerScreening(input(), s.deps)).toEqual({})
    const events = vi.mocked(console.info).mock.calls.map(args => String(args[1] ?? ''))
    expect(events.some(text => text.includes('review_v2_admission_denied'))).toBe(true)
    expect(events.some(text => text.includes('review_v2_admission_granted'))).toBe(false)
  })
  it('logs the criteria derivation reason for a stub listing', async () => {
    const s = setup()
    s.deps.loadJob = vi.fn(async () => ({ ...job, description: 'We are hiring a kitchen helper for night shifts at our busy restaurant in town.' }))
    expect(await inlineEmployerScreening(input(), s.deps)).toEqual({})
    expect(s.fetcher).not.toHaveBeenCalled()
    const events = vi.mocked(console.info).mock.calls.map(args => String(args[1] ?? ''))
    expect(events.some(text => text.includes('job_mapping_unavailable'))).toBe(true)
    expect(events.some(text => text.includes('job_mapping_no_explicit_requirements'))).toBe(true)
  })
  it('returns baseline at the unchanged25s deadline and prevents a late count from dispatching', async () => {
    vi.useFakeTimers(); const s = setup()
    let resolve!: (value: Response) => void
    s.fetcher.mockImplementation(() => new Promise<Response>(yes => { resolve = yes }))
    const result = inlineEmployerScreening(input(), s.deps)
    await vi.advanceTimersByTimeAsync(0); expect(s.fetcher).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(INLINE_SCREENING_BUDGET_MS + 1)
    expect(await result).toEqual({})
    resolve(new Response('{"object":"response.input_tokens","input_tokens":1200}')); await vi.advanceTimersByTimeAsync(0)
    expect(s.reviewBudget.reserve).not.toHaveBeenCalled(); expect(s.fetcher).toHaveBeenCalledOnce(); expect(s.deps.budget).not.toHaveBeenCalled()
  })
  it('does not replace baseline with a late generation and never retries after dispatch', async () => {
    vi.useFakeTimers(); const s = setup()
    let resolve!: (value: Response) => void
    s.fetcher.mockImplementation(async url => String(url).endsWith('/input_tokens') ? new Response('{"object":"response.input_tokens","input_tokens":1200}')
      : new Promise<Response>(yes => { resolve = yes }))
    const result = inlineEmployerScreening(input(), s.deps)
    await vi.advanceTimersByTimeAsync(0); expect(s.fetcher).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(INLINE_SCREENING_BUDGET_MS + 1); expect(await result).toEqual({})
    resolve(new Response('{}')); await vi.advanceTimersByTimeAsync(0)
    expect(s.reviewBudget.settle).toHaveBeenCalledExactlyOnceWith(reservation, null)
    expect(s.fetcher).toHaveBeenCalledTimes(2); expect(s.deps.budget).not.toHaveBeenCalled()
  })
  it('keeps parser absence and job-binding failure baseline-only without any count', async () => {
    const s = setup(); s.deps.extract = vi.fn(async () => null)
    expect(await inlineEmployerScreening(input(), s.deps)).toEqual({}); expect(s.fetcher).not.toHaveBeenCalled()
    const other = setup(); other.deps.loadJob = vi.fn(async () => ({ ...job, company_id: 'different-company' }))
    expect(await inlineEmployerScreening(input(), other.deps)).toEqual({}); expect(other.fetcher).not.toHaveBeenCalled()
  })
  it('parses a real synthetic PDF with the production worker before the mocked count/generation and renderer', async () => {
    const require = createRequire(import.meta.url)
    const PDF = require('pdfkit') as new () => Readable & { text(text: string): void; end(): void }
    const doc = new PDF(), chunks: Buffer[] = []
    const ready = new Promise<Buffer>((resolve, reject) => { doc.on('data', part => chunks.push(part)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks))) })
    doc.text(SYNTHETIC_REVIEW_PAGE); doc.end()
    const pdf = await ready, s = setup(); delete s.deps.extract
    const fields = await inlineEmployerScreening(input(pdf), s.deps)
    expect(fields.employer_resume_review_v2).toMatchObject({ qualityScore: { value: 8 }, roleFitScore: { value: 4 } })
    expect(s.fetcher).toHaveBeenCalledTimes(2)
  }, 10_000)

  it('counts and generates once from the actual builder PDF with full coverage and both rating permissions', async () => {
    // The builder emits summary/work/education/skills, so bind the existing
    // synthetic review's work and skill references to their actual record IDs.
    const response = syntheticReviewRaw()
    for (const row of [response.overview, ...response.dimensions, ...response.highlights, ...response.gaps]) {
      row.sourceIds = row.sourceIds.map(id => id === 'r1' ? 'r2' : id === 'r2' ? 'r4' : id)
    }
    const pdf = await renderBuilderResume(builderScreeningFixture())
    expect(pdf).not.toBeNull()
    const s = setup(response); delete s.deps.extract
    const unexpectedFetch = vi.fn(() => { throw new Error('No live network allowed') })
    vi.stubGlobal('fetch', unexpectedFetch)
    const fields = await inlineEmployerScreening(input(pdf!), s.deps)
    expect(fields.employer_resume_review_v2).toMatchObject({ qualityScore: { value: 8 }, roleFitScore: { value: 4 } })
    expect(s.reviewBudget.claim).toHaveBeenCalledOnce()
    expect(s.reviewBudget.countAllowed).toHaveBeenCalledOnce()
    expect(s.reviewBudget.reserve).toHaveBeenCalledOnce()
    expect(s.reviewBudget.dispatchAllowed).toHaveBeenCalledOnce()
    expect(s.reviewBudget.settle).toHaveBeenCalledOnce()
    expect(s.fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.openai.com/v1/responses/input_tokens', 'https://api.openai.com/v1/responses',
    ])
    const request = String(s.fetcher.mock.calls[1][1]!.body)
    expect(request).toContain('Aurora Supply')
    expect(request).toContain('Harbour Stores')
    expect(request).toContain('Microsoft Excel')
    expect(request).not.toMatch(/Jordan|Ellis|jordan\.ellis@|555-0148|localPages|%PDF|base64/)
    expect(unexpectedFetch).not.toHaveBeenCalled()
  }, 15_000)

  it.each(['partial', 'full'] as const)('admits a synthetic availability PDF once with truthful %s coverage rendering', async coverage => {
    const require = createRequire(import.meta.url)
    const PDF = require('pdfkit') as new () => Readable & { text(text: string): void; end(): void }
    const doc = new PDF(), chunks: Buffer[] = []
    const ready = new Promise<Buffer>((resolve, reject) => { doc.on('data', part => chunks.push(part)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks))) })
    const page = coverage === 'partial' ? 'Additional context supplied separately\n' + SYNTHETIC_REVIEW_PAGE
      : SYNTHETIC_REVIEW_PAGE.replace('Jordan Ellis\n', 'Jordan Ellis\nCUSTOMER SERVICE & HOSPITALITY\nGuest services | Multilingual communication\n')
    doc.text(page +
      '\nAVAILABILITY & REFERENCES\nWilling\nto undertake training. References available upon request.\nJordan Ellis | Customer Service Assistant')
    doc.end()
    const response = syntheticReviewRaw()
    response.overview.text = 'The supplied professional sections describe customer service and record keeping.'
    response.gaps = [] // Incomplete input cannot support claims that evidence is absent.
    if (coverage === 'full') for (const row of [response.overview, ...response.dimensions, ...response.highlights]) {
      row.sourceIds = row.sourceIds.map(id => id === 'r1' ? 'r3' : id === 'r2' ? 'r4' : id)
    }
    const s = setup(response); delete s.deps.extract
    const unexpectedFetch = vi.fn(() => { throw new Error('No live network allowed') })
    vi.stubGlobal('fetch', unexpectedFetch)
    const fields = await inlineEmployerScreening(input(await ready), s.deps)
    expect(fields.employer_resume_review_v2).toMatchObject(coverage === 'partial' ? { coverage,
      qualityScore: { status: 'unavailable', reason: 'partial_professional_input' },
      roleFitScore: { status: 'unavailable', reason: 'partial_professional_input' } } : { coverage,
      qualityScore: { value: 8 }, roleFitScore: { value: 4 } })
    expect(s.reviewBudget.claim).toHaveBeenCalledOnce()
    expect(s.reviewBudget.countAllowed).toHaveBeenCalledOnce()
    expect(s.reviewBudget.reserve).toHaveBeenCalledOnce()
    expect(s.reviewBudget.dispatchAllowed).toHaveBeenCalledOnce()
    expect(s.reviewBudget.settle).toHaveBeenCalledOnce()
    expect(s.fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.openai.com/v1/responses/input_tokens', 'https://api.openai.com/v1/responses',
    ])
    const request = String(s.fetcher.mock.calls[1][1]!.body)
    expect(request).toContain('Answered customer enquiries')
    expect(request).not.toMatch(/Additional context supplied separately|Jordan|Ellis|Willing|undertake training|References available|555-0148|localPages|%PDF|base64/)
    const html = buildEmailHtml('new_applicant', { ...fields, applicant_name: 'Fictional Applicant', job_title: job.title, cv_attached: true }).html
    if (coverage === 'partial') {
      expect(html).toContain('Not rated')
      expect(html).toContain('Partial text assessment.')
      expect(html).not.toMatch(/\d+\/10/)
    } else {
      expect(request).toContain('CUSTOMER SERVICE & HOSPITALITY')
      expect(request).toContain('Guest services | Multilingual communication')
      expect(html).toContain('8/10')
      expect(html).toContain('4/10')
      expect(html).not.toContain('Partial text assessment.')
    }
    expect(unexpectedFetch).not.toHaveBeenCalled()
  }, 10_000)

  it.each(['three-page variant headings', 'two-page locality and extracurricular activities'])
    ('forwards one enriched email after parsing a PDF with %s and counting/generating once', async format => {
    const require = createRequire(import.meta.url)
    const PDF = require('pdfkit') as new () => Readable & { text(text: string): void; addPage(): void; end(): void }
    const doc = new PDF(), chunks: Buffer[] = []
    const ready = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', part => chunks.push(part)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)))
    })
    const localityActivities = format.startsWith('two-page')
    const header = localityActivities
      ? SYNTHETIC_REVIEW_PAGE.replace('jordan.ellis@example.invalid | +1 (268) 555-0148', 'Cedar Pasture (268)555-0123\njordan.ellis@example.invalid')
      : SYNTHETIC_REVIEW_PAGE.replace('Work Experience', 'Phone: 1(202) 555-0101 or 1 (202) 555-0102\nWork Experience')
    doc.text(header.replace('Work Experience', 'Work Experiences:').replace('Skills\n',
      'Processed returns when replacement stock was not needed.\nReconciled customer logs without errors and provided training to customers.\nSkills\n'))
    doc.addPage()
    doc.text('Educational Background\nDiploma in business operations, completed 2021.\nCoursework included customer-service practice drills.')
    if (localityActivities) {
      doc.text('Extra- Curricular Activities:\nMember of the Black Orchard Speaking Club.\nA leader in the Local Volunteer Association.\nA gold member of the Community Achievement Award.\nHobbies\nReading and hiking.')
    } else {
      doc.text('Interests & Activities\nReading and hiking.')
      doc.addPage()
    }
    doc.text('References\n(1) Alex Smith\nHead of Customer Service\nAcme\nalex@example.invalid\n+1 (202) 555-0199\n(2) Jamie Jones\nManager – Training and Development\nAcme Shipping Company\njamie@example.invalid\n+1 (202) 555-0198\nAvailable on request.')
    doc.end()
    const pdf = await ready, s = setup(); delete s.deps.extract
    delivery.dependencies.mockReturnValue(s.deps)
    delivery.download.mockResolvedValue({ data: new Blob([new Uint8Array(pdf)]), error: null })
    delivery.send.mockResolvedValue({ success: true, id: 'synthetic-accepted' })
    const rows: Record<string, Record<string, unknown>> = {
      applications: { id: app, job_id: job.id, seeker_id: 'synthetic-profile', cover_letter_text: '' },
      seeker_profiles: { id: 'synthetic-profile', user_id: user, first_name: 'Jordan', last_name: 'Ellis', cv_url: `${user}/synthetic.pdf` },
      job_listings: job, companies: { id: job.company_id, user_id: 'synthetic-owner', company_name: 'Example Retail', contact_email: 'owner@example.invalid' },
      owner: { id: 'synthetic-owner', email: 'owner@example.invalid', email_verified: true, is_banned: false },
      applicant: { id: user, email: 'jordan.ellis@example.invalid', is_banned: false },
    }
    delivery.from.mockImplementation((table: string) => {
      const filters: [string, unknown][] = []
      const query = { select: () => query, update: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
        single: async () => {
          const row = rows[table === 'users' ? (filters.some(([, value]) => value === user) ? 'applicant' : 'owner') : table]
          return { data: row && filters.every(([key, value]) => row[key] === value) ? row : null, error: null }
        }, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) }
      return query
    })
    for (const [key, value] of Object.entries(s.deps.env!)) vi.stubEnv(key, value)
    vi.stubEnv('RESEND_API_KEY', 'synthetic-no-delivery')
    const unexpectedFetch = vi.fn(() => { throw new Error('No live network allowed') })
    vi.stubGlobal('fetch', unexpectedFetch)

    expect(await notifyNewApplicant(app, user, SCREENING_NOTICE_VERSION)).toBe(true)
    expect(delivery.download).toHaveBeenCalledExactlyOnceWith(`${user}/synthetic.pdf`)
    expect(s.reviewBudget.claim).toHaveBeenCalledOnce()
    expect(s.reviewBudget.countAllowed).toHaveBeenCalledOnce()
    expect(s.reviewBudget.reserve).toHaveBeenCalledOnce()
    expect(s.reviewBudget.dispatchAllowed).toHaveBeenCalledOnce()
    expect(s.reviewBudget.settle).toHaveBeenCalledOnce()
    expect(s.fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.openai.com/v1/responses/input_tokens', 'https://api.openai.com/v1/responses',
    ])
    const request = String(s.fetcher.mock.calls[1][1]!.body)
    expect(request).toContain('Work Experiences:')
    expect(request).toContain('Educational Background')
    expect(request).toContain('not needed')
    expect(request).toContain('Coursework included')
    if (localityActivities) {
      expect(request).toContain('Extra- Curricular Activities:')
      expect(request).toContain('Member of the Black Orchard Speaking Club.')
      expect(request).toContain('A leader in the Local Volunteer Association.')
      expect(request).toContain('A gold member of the Community Achievement Award.')
    }
    expect(request).not.toMatch(/Jordan Ellis|Cedar Pasture|jordan.ellis@|Alex Smith|Jamie Jones|Acme|555-01|Manager – Training|hiking|localPages|%PDF|base64/)
    expect(delivery.send).toHaveBeenCalledOnce()
    const message = delivery.send.mock.calls[0][0]
    expect(message.idempotencyKey).toBe(`application/${app}/employer`)
    expect(message.attachments[0].content).toEqual(pdf)
    expect(message.data.employer_resume_review_v2).toMatchObject({ qualityScore: { value: 8 }, roleFitScore: { value: 4 } })
    expect(buildEmailHtml('new_applicant', message.data).html).toContain('Gaps for this role')
    expect(s.fetcher.mock.invocationCallOrder[1]).toBeLessThan(delivery.send.mock.invocationCallOrder[0])
    expect(unexpectedFetch).not.toHaveBeenCalled()
  }, 10_000)
})
