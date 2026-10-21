// @vitest-environment node
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import type { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { INLINE_SCREENING_BUDGET_MS, INLINE_SCREENING_GATES, inlineEmployerScreening, inlineScreeningEnabled,
  SupabaseInlineScreeningBudgetStore, type InlineScreeningInput, type InlineScreeningDependencies } from '../src/lib/employer-screening/inline'
import { SCREENING_NOTICE_VERSION } from '../src/lib/employer-screening/notice'
import { APPROVED_SCREENING_MODEL, type ScreeningBudgetStore, type ScreeningBudgetReservation } from '../src/lib/employer-screening/provider'
import type { PdfResumeExtraction } from '../src/lib/employer-screening/pdf-extraction'
import { buildEmailHtml } from '../src/lib/email-templates'
import { resumeFixture } from './fixtures/resume'

const require = createRequire(import.meta.url)
type PdfDocument = Readable & { text(value: string): PdfDocument; end(): void }
const PDFDocument = require('pdfkit') as new (options?: Record<string, unknown>) => PdfDocument
async function uploadedPdf(): Promise<Buffer> {
  const doc = new PDFDocument({ compress: true })
  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
  doc.text('Synthetic Applicant\nsynthetic@example.invalid\nSkills\nMicrosoft Excel')
  doc.end()
  return done
}

const app = '11111111-1111-4111-8111-111111111111'
const user = '22222222-2222-4222-8222-222222222222'
const reservationId = '33333333-3333-4333-8333-333333333333'
const lease = '44444444-4444-4444-8444-444444444444'
const bytes = Buffer.from('%PDF-1.7\nSynthetic private original bytes\n%%EOF')
const digest = createHash('sha256').update(bytes).digest('hex')
const page = 'Private Applicant\nprivate@example.invalid\nSkills\nMicrosoft Excel\nWork Experience\nOffice Assistant | Example Supply\nMaintained spreadsheet records'
const start = page.indexOf('Microsoft Excel')
const parsed = (): PdfResumeExtraction => ({ sourceSha256: digest,
  evidence: [{ id: 'skill_1', category: 'skill', excerpt: 'Microsoft Excel', location: `pdf.page[1].span[${start}:${start + 15}]` }],
  localPages: [page],
})
const input = (): InlineScreeningInput => ({ applicationId: app, applicantUserId: user, jobId: 'private-job',
  companyId: 'private-company', jobTitle: 'Private title', noticeVersion: SCREENING_NOTICE_VERSION, resumeBytes: bytes })
const env = (): Record<string, string | undefined> => ({ ...Object.fromEntries(INLINE_SCREENING_GATES.map(key => [key, 'true'])),
  EMPLOYER_SCREENING_PAID_PROVIDER_ENABLED: 'true', EMPLOYER_SCREENING_BUDGET_APPROVED: 'true',
  EMPLOYER_SCREENING_BUDGET_CONFIG_ID: 'synthetic-config', OPENAI_API_KEY: 'synthetic-only-no-live-calls' })
const reservation = (): ScreeningBudgetReservation => ({ reservation_id: reservationId, reserved_microusd: 2024,
  model: APPROVED_SCREENING_MODEL, input_microusd_per_million: 1_000_000, output_microusd_per_million: 1_000_000,
  input_token_ceiling: 1000, max_output_tokens: 1024 })
const rawResponse = () => ({ id: 'resp_synthetic_inline', model: APPROVED_SCREENING_MODEL, service_tier: 'default',
  status: 'completed', error: null, incomplete_details: null,
  output: [{ type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({
    assessments: [{ criterionId: 'c1', finding: 'supported', evidenceIds: ['e1'] }],
  }) }] }],
  usage: { input_tokens: 90, output_tokens: 20, total_tokens: 110, output_tokens_details: { reasoning_tokens: 10 },
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
function setup() {
  const budget: ScreeningBudgetStore = { reserve: vi.fn(async () => reservation()), start: vi.fn(async () => true),
    release: vi.fn(async () => false), settle: vi.fn(async () => true) }
  const extract = vi.fn<NonNullable<InlineScreeningDependencies['extract']>>(async () => parsed())
  const loadJob = vi.fn(async () => ({ id: 'private-job', company_id: 'private-company', title: 'Private title',
    status: 'active', description: 'Requirements:\n- Microsoft Excel' }))
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(rawResponse())))
  const deps: InlineScreeningDependencies = { extract, loadJob, budget: vi.fn(() => budget), fetch: fetcher, env: env() }
  return { budget, extract, loadJob, fetcher, deps, run: (value = input()) => inlineEmployerScreening(value, deps) }
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('bounded inline advisory with an unchanged existing delivery', () => {
  it.each(INLINE_SCREENING_GATES)('does zero parsing or paid work when %s is absent', async gate => {
    const test = setup(); delete test.deps.env![gate]
    expect(inlineScreeningEnabled(SCREENING_NOTICE_VERSION, test.deps.env)).toBe(false)
    expect(await test.run()).toEqual({})
    expect(test.extract).not.toHaveBeenCalled(); expect(test.loadJob).not.toHaveBeenCalled(); expect(test.budget.reserve).not.toHaveBeenCalled()
  })
  it.each([undefined, null, 'old', true])('requires the actual current notice attestation: %s', async noticeVersion => {
    const test = setup()
    expect(await test.run({ ...input(), noticeVersion })).toEqual({})
    expect(test.extract).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled()
  })
  it('does not depend on expanded queue/capture/worker/webhook readiness gates', async () => {
    const test = setup()
    expect(await test.run()).toMatchObject({ employer_screening: { status: 'scored', supportedPoints: 100 },
      employer_resume_quality: { status: 'assessed', sourceSha256: digest } })
    expect(test.extract).toHaveBeenCalledExactlyOnceWith(bytes, { signal: expect.any(AbortSignal), budgetMs: expect.any(Number) })
    expect(test.extract.mock.calls[0][0]).toBe(bytes)
    expect(test.budget.reserve).toHaveBeenCalledOnce(); expect(test.fetcher).toHaveBeenCalledOnce()
    const body = JSON.parse(test.fetcher.mock.calls[0][1]!.body as string)
    expect(body).toMatchObject({ model: APPROVED_SCREENING_MODEL, store: false, max_output_tokens: 1024,
      reasoning: { effort: 'low' }, prompt_cache_options: { mode: 'explicit' } })
    expect(JSON.stringify(body)).not.toMatch(/Private Applicant|private@example|Private title|private-company|private-job|11111111|sourceSha256|localPages|Synthetic private/)
    expect(JSON.parse(body.input[0].content[0].text)).toMatchObject({ rubric: [{ requirement: 'Microsoft Excel' }] })
  })
  it.each(['uploaded', 'builder'])('screens a real %s PDF using the same bounded parser, without storing the PDF or sending raw pages', async source => {
    let resumeBytes: Buffer
    if (source === 'uploaded') resumeBytes = await uploadedPdf()
    else {
      const { createResumeDocument } = await import('../src/lib/resume-pdf')
      const { renderToBuffer } = await import('@react-pdf/renderer')
      resumeBytes = await renderToBuffer(createResumeDocument({ ...resumeFixture,
        profile: { ...resumeFixture.profile, user_id: user, summary: '' },
        skills: [{ id: 'synthetic-skill', cv_profile_id: 'cv-1', name: 'Microsoft Excel', sort_order: 0 }],
        experiences: [], education: [], certifications: [], projects: [], volunteer: [], awards: [], languages: [], memberships: [], references: [],
      }))
    }
    const before = Buffer.from(resumeBytes), test = setup()
    const result = await inlineEmployerScreening({ ...input(), resumeBytes }, { ...test.deps, extract: undefined })
    expect(result).toMatchObject({ employer_screening: { status: 'scored', supportedPoints: 100 }, employer_resume_quality: {
      status: 'assessed', sourceSha256: createHash('sha256').update(resumeBytes).digest('hex'),
    } })
    expect(resumeBytes).toEqual(before)
    expect(test.fetcher).toHaveBeenCalledOnce()
    const outbound = test.fetcher.mock.calls[0][1]!.body as string
    expect(outbound).not.toMatch(/Simone|Francis|Synthetic Applicant|synthetic@example|simone@example|localPages|base64|%PDF/)
    expect(JSON.stringify(result)).not.toMatch(/Simone|Francis|synthetic@example|simone@example/)
  })
  it.each(['EMPLOYER_SCREENING_PAID_PROVIDER_ENABLED', 'EMPLOYER_SCREENING_BUDGET_APPROVED',
    'EMPLOYER_SCREENING_BUDGET_CONFIG_ID', 'OPENAI_API_KEY'])('retains local presentation but makes no provider/criteria request without %s', async key => {
    const test = setup(); delete test.deps.env![key]
    expect(await test.run()).toMatchObject({ employer_resume_quality: { status: 'assessed' } })
    expect(test.loadJob).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled(); expect(test.budget.reserve).not.toHaveBeenCalled()
  })
  it.each(['missing', 'inactive', 'changed-company', 'changed-title'])('retains independent local presentation when published criteria are %s', async scenario => {
    const test = setup()
    const job = await test.loadJob()
    if (scenario === 'missing') job.description = 'We offer a welcoming environment.'
    if (scenario === 'inactive') job.status = 'closed'
    if (scenario === 'changed-company') job.company_id = 'other-company'
    if (scenario === 'changed-title') job.title = 'Edited title'
    test.loadJob.mockResolvedValue(job)
    const result = await test.run()
    expect(result.employer_resume_quality?.status).toBe('assessed'); expect(result).not.toHaveProperty('employer_screening')
    expect(test.budget.reserve).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled()
  })
  it.each(['null', 'throw', 'wrong-digest'])('returns the original baseline fields when parser is %s', async scenario => {
    const test = setup()
    if (scenario === 'null') test.extract.mockResolvedValue(null)
    if (scenario === 'throw') test.extract.mockRejectedValue(new Error('private parser text'))
    if (scenario === 'wrong-digest') test.extract.mockResolvedValue({ ...parsed(), sourceSha256: 'a'.repeat(64) })
    expect(await test.run()).toEqual({}); expect(test.fetcher).not.toHaveBeenCalled(); expect(test.loadJob).not.toHaveBeenCalled()
  })
  it('does not use unsupported private extraction as model evidence; local pages never leave the process', async () => {
    const test = setup()
    test.extract.mockResolvedValue({ ...parsed(), evidence: [{ ...parsed().evidence[0], excerpt: 'Private Applicant private@example.invalid' }] })
    const result = await test.run()
    expect(result).toHaveProperty('employer_resume_quality'); expect(result).not.toHaveProperty('employer_screening')
    expect(test.budget.reserve).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/Private Applicant|private@example/)
  })
  it.each(['budget-denied', 'budget-error', 'provider-error', 'invalid-output', 'settlement-error', 'settlement-false'])('retains only local presentation on %s with no retries', async scenario => {
    const test = setup()
    if (scenario === 'budget-denied') vi.mocked(test.budget.reserve).mockResolvedValue(null)
    if (scenario === 'budget-error') vi.mocked(test.budget.reserve).mockRejectedValue(new Error('uncertain DB request'))
    if (scenario === 'provider-error') test.fetcher.mockRejectedValue(new Error('uncertain provider request'))
    if (scenario === 'invalid-output') test.fetcher.mockResolvedValue(new Response('{"private":"malformed output"}'))
    if (scenario === 'settlement-error') vi.mocked(test.budget.settle).mockRejectedValue(new Error('settlement unavailable'))
    if (scenario === 'settlement-false') vi.mocked(test.budget.settle).mockResolvedValue(false)
    const result = await test.run()
    expect(result).toHaveProperty('employer_resume_quality'); expect(result).not.toHaveProperty('employer_screening')
    expect(test.budget.reserve).toHaveBeenCalledOnce()
    expect(test.fetcher).toHaveBeenCalledTimes(scenario.startsWith('budget') ? 0 : 1)
    expect(test.budget.release).not.toHaveBeenCalled()
    expect(buildEmailHtml('new_applicant', result).html).toContain('No score was assigned')
  })
  it('aborts a stalled parser at the absolute 25-second cutoff and ignores its late result', async () => {
    vi.useFakeTimers()
    const test = setup(), stalled = deferred<PdfResumeExtraction>()
    test.extract.mockReturnValue(stalled.promise)
    const work = test.run()
    await vi.advanceTimersByTimeAsync(INLINE_SCREENING_BUDGET_MS)
    expect(await work).toEqual({})
    expect(test.extract.mock.calls[0][1].signal?.aborted).toBe(true)
    stalled.resolve(parsed()); await vi.advanceTimersByTimeAsync(0)
    expect(test.loadJob).not.toHaveBeenCalled(); expect(test.budget.reserve).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled()
  })
  it('does not dispatch after a late reservation, even if the adapter ignores cancellation', async () => {
    vi.useFakeTimers()
    const test = setup(), stalled = deferred<ScreeningBudgetReservation | null>()
    vi.mocked(test.budget.reserve).mockReturnValue(stalled.promise)
    const work = test.run()
    await vi.advanceTimersByTimeAsync(INLINE_SCREENING_BUDGET_MS)
    const result = await work
    expect(result).toHaveProperty('employer_resume_quality'); expect(result).not.toHaveProperty('employer_screening')
    stalled.resolve(reservation()); await vi.advanceTimersByTimeAsync(0)
    expect(test.budget.start).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled()
  })
  it('does not spend after a delayed published-job read crosses the overall cutoff', async () => {
    vi.useFakeTimers()
    const test = setup(), job = await test.loadJob(), stalled = deferred<typeof job>()
    test.loadJob.mockReturnValue(stalled.promise)
    const work = test.run()
    await vi.advanceTimersByTimeAsync(INLINE_SCREENING_BUDGET_MS)
    expect(await work).not.toHaveProperty('employer_screening')
    stalled.resolve(job); await vi.advanceTimersByTimeAsync(0)
    expect(test.budget.reserve).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled()
  })
  it('allows a response after the former eight-second window while keeping parser and total bounds fixed', async () => {
    vi.useFakeTimers()
    expect(INLINE_SCREENING_BUDGET_MS).toBe(25_000)
    const test = setup(), response = deferred<Response>()
    test.fetcher.mockReturnValue(response.promise)
    const work = test.run()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(test.extract.mock.calls[0][1]?.budgetMs).toBe(3_000)
    expect(test.fetcher).toHaveBeenCalledOnce()
    expect(test.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false)
    response.resolve(new Response(JSON.stringify(rawResponse())))
    await vi.advanceTimersByTimeAsync(0)
    expect(await work).toMatchObject({ employer_screening: { status: 'scored', supportedPoints: 100 } })
    expect(test.budget.settle).toHaveBeenCalledOnce()
  })
  it('shares one absolute deadline across parsing and model response rather than granting a fresh model window', async () => {
    vi.useFakeTimers()
    const test = setup(), parsing = deferred<PdfResumeExtraction>(), response = deferred<Response>()
    test.extract.mockReturnValue(parsing.promise); test.fetcher.mockReturnValue(response.promise)
    const work = test.run()
    await vi.advanceTimersByTimeAsync(2500)
    parsing.resolve(parsed()); await vi.advanceTimersByTimeAsync(0)
    expect(test.fetcher).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(INLINE_SCREENING_BUDGET_MS - 2500)
    expect(await work).not.toHaveProperty('employer_screening')
    expect(test.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    response.resolve(new Response(JSON.stringify(rawResponse()))); await vi.advanceTimersByTimeAsync(0)
  })
  it('does not wait for a stalled settlement beyond the same email deadline', async () => {
    vi.useFakeTimers()
    const test = setup(), settling = deferred<boolean>()
    vi.mocked(test.budget.settle).mockReturnValue(settling.promise)
    const work = test.run()
    await vi.advanceTimersByTimeAsync(INLINE_SCREENING_BUDGET_MS)
    const result = await work
    expect(test.fetcher).toHaveBeenCalledOnce(); expect(test.budget.settle).toHaveBeenCalledOnce()
    expect(result).toHaveProperty('employer_resume_quality'); expect(result).not.toHaveProperty('employer_screening')
    settling.resolve(true); await vi.advanceTimersByTimeAsync(0)
    expect(result).not.toHaveProperty('employer_screening')
  })
  it('aborts a stalled provider and never adds its late output to the returned email fields', async () => {
    vi.useFakeTimers()
    const test = setup(), stalled = deferred<Response>()
    test.fetcher.mockReturnValue(stalled.promise)
    const work = test.run()
    await vi.advanceTimersByTimeAsync(INLINE_SCREENING_BUDGET_MS)
    const result = await work
    expect(result).toHaveProperty('employer_resume_quality'); expect(result).not.toHaveProperty('employer_screening')
    expect(test.fetcher).toHaveBeenCalledOnce(); expect(test.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    stalled.resolve(new Response(JSON.stringify(rawResponse()))); await vi.advanceTimersByTimeAsync(0)
    expect(result).not.toHaveProperty('employer_screening'); expect(test.fetcher).toHaveBeenCalledOnce()
  })
})

describe('inline unique-attempt paid adapter', () => {
  const reserveInput = () => ({ applicationId: app, lease, snapshotSha256: digest, configId: 'synthetic-config',
    maxOutputTokens: 1024, requestKey: `screening/${app}/${digest}` })
  function adapter() {
    const now = Date.now(), controller = new AbortController()
    const dispatchNotAfter = new Date(now + 7000).toISOString()
    const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
      void name; void args
      return { abortSignal: vi.fn(async (signal: AbortSignal) => {
        void signal
        return { data: { ...reservation(), dispatch_not_after: dispatchNotAfter } as unknown, error: null }
      }) }
    })
    const store = new SupabaseInlineScreeningBudgetStore({ rpc }, { applicantUserId: user, deadline: now + 8000, signal: controller.signal })
    return { now, controller, rpc, store }
  }
  it('binds reserve to the existing application and owner; reuses one authorization and never releases the full hold', async () => {
    const test = adapter()
    expect(await test.store.reserve(reserveInput())).toEqual(reservation())
    expect(test.rpc).toHaveBeenCalledExactlyOnceWith('employer_screening_begin_inline', expect.objectContaining({
      p_application_id: app, p_applicant_user_id: user, p_snapshot_sha256: digest,
      p_input_token_ceiling: null, p_max_output_tokens: 1024, p_deadline: new Date(test.now + 8000).toISOString(),
    }))
    expect(test.rpc.mock.results[0].value.abortSignal).toHaveBeenCalledWith(test.controller.signal)
    expect(await test.store.start(reservationId, lease)).toBe(true)
    expect(await test.store.start(reservationId, lease)).toBe(false)
    expect(await test.store.reserve(reserveInput())).toBeNull()
    expect(await test.store.release()).toBe(false)
    expect(test.rpc).toHaveBeenCalledOnce()
  })
  it('refuses dispatch after the stricter database cutoff, even before the global deadline', async () => {
    vi.useFakeTimers()
    const test = adapter(); await test.store.reserve(reserveInput())
    await vi.advanceTimersByTimeAsync(7000)
    expect(await test.store.start(reservationId, lease)).toBe(false)
    expect(await test.store.release()).toBe(false)
  })
  it('cannot make or settle RPC calls after the absolute cutoff', async () => {
    vi.useFakeTimers()
    const test = adapter(); await test.store.reserve(reserveInput())
    await vi.advanceTimersByTimeAsync(8000)
    await expect(test.store.start(reservationId, lease)).rejects.toThrow()
    await expect(test.store.settle(reservationId, null)).rejects.toThrow()
    expect(test.rpc).toHaveBeenCalledOnce()
  })
  it('uses exact confirmed usage evidence only for bounded settlement', async () => {
    const test = adapter(); await test.store.reserve(reserveInput())
    test.rpc.mockImplementation(() => ({ abortSignal: vi.fn(async () => ({ data: true, error: null })) }))
    expect(await test.store.settle(reservationId, { inputTokens: 90, outputTokens: 20, evidenceId: 'resp_synthetic' })).toBe(true)
    expect(test.rpc).toHaveBeenLastCalledWith('employer_screening_settle_inline', { p_reservation_id: reservationId,
      p_input_tokens: 90, p_output_tokens: 20, p_evidence_id: 'resp_synthetic' })
  })
})
