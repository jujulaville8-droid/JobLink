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
const app = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222'
const reservation = '33333333-3333-4333-8333-333333333333'
const bytes = Buffer.from('synthetic parser-injection fixture only')
const hash = (input: Uint8Array) => createHash('sha256').update(input).digest('hex')
const input = (resumeBytes: Uint8Array = bytes) => ({ applicationId: app, applicantUserId: user, jobId: 'synthetic-job', companyId: 'synthetic-company',
  jobTitle: 'Outbound Sales Representative', noticeVersion: SCREENING_NOTICE_VERSION, resumeBytes })
const job = { id: 'synthetic-job', company_id: 'synthetic-company', title: 'Outbound Sales Representative', status: 'active',
  description: `Responsibilities\n${syntheticReviewContext().rubric.map(row => `- ${row.requirement}`).join('\n')}` }
function setup() {
  const reviewBudget: SolReviewBudgetStore = { claim: vi.fn(async () => true), countAllowed: vi.fn(() => true),
    reserve: vi.fn(async request => ({ reservation_id: reservation, model: SOL_REVIEW_MODEL, input_token_ceiling: request.inputTokenCount,
      max_output_tokens: 2048, input_microusd_per_million: 5_500_000, output_microusd_per_million: 16_500_000,
      reserved_microusd: reservedCostMicrousd(request.inputTokenCount, 2048, 5_500_000, 16_500_000),
      request_sha256: request.requestSha256, config_id: request.configId, reasoning_effort: 'low', service_tier: 'default',
      token_count_source: 'responses_input_tokens', dispatch_not_after: new Date(Date.now() + 25_000).toISOString() })),
    dispatchAllowed: vi.fn(() => true), settle: vi.fn(async () => true) }
  const fetcher = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url).endsWith('/input_tokens') ? { object: 'response.input_tokens', input_tokens: 1200 }
    : { id: 'resp_synthetic_v2', model: SOL_REVIEW_MODEL, service_tier: 'default', status: 'completed', error: null, incomplete_details: null,
      output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(syntheticReviewRaw()) }] }],
      usage: { input_tokens: 1200, output_tokens: 900, total_tokens: 2100,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 100 } } })))
  const deps: { -readonly [K in keyof InlineScreeningDependencies]: InlineScreeningDependencies[K] } = { loadJob: vi.fn(async () => job), budget: vi.fn(() => { throw new Error('Luna must not run') }),
    reviewBudget: vi.fn(() => reviewBudget), fetch: fetcher,
    extract: vi.fn(async b => ({ sourceSha256: hash(b), evidence: [], context: [], omittedContext: true, localPages: [SYNTHETIC_REVIEW_PAGE] })),
    env: { ...Object.fromEntries(INLINE_SCREENING_GATES.map(key => [key, 'true'])),
      EMPLOYER_SCREENING_REVIEW_V2_ENABLED: 'true', EMPLOYER_SCREENING_REVIEW_V2_PRIVACY_APPROVED: 'true',
      EMPLOYER_SCREENING_REVIEW_V2_BUDGET_CONFIG_ID: 'synthetic-sol', EMPLOYER_SCREENING_PAID_PROVIDER_ENABLED: 'true',
      EMPLOYER_SCREENING_BUDGET_APPROVED: 'true', OPENAI_API_KEY: 'synthetic-not-a-key' } }
  return { deps, reviewBudget, fetcher }
}
beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}))
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
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
})
