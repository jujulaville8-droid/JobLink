import { describe, expect, it, vi } from 'vitest'
import { captureSnapshot, screen, type Snapshot } from '../src/lib/employer-screening'
import { minimizeBuilderSkills } from '../src/lib/employer-screening/privacy'
import { APPROVED_SCREENING_ENDPOINT, APPROVED_SCREENING_MODEL, createOpenAIProcessor, reservedCostMicrousd, SupabaseScreeningBudgetStore,
  type OpenAIProcessorOptions, type ScreeningBudgetReservation, type ScreeningBudgetStore } from '../src/lib/employer-screening/provider'

const appId = '11111111-1111-4111-8111-111111111111'
const lease = '22222222-2222-4222-8222-222222222222'
const reservationId = '33333333-3333-4333-8333-333333333333'
const source = new TextEncoder().encode('Synthetic Microsoft Excel CV')
const extraction = minimizeBuilderSkills(['Microsoft Excel'], source)
const fixture = (): Snapshot => ({
  applicationId: appId, jobId: 'private-job', companyId: 'private-company', createdAt: Date.now(),
  resume: { versionId: 'private-resume-version', sha256: extraction.sourceSha256, evidence: extraction.evidence.map(e => ({ ...e })) },
  job: { title: 'Private title Jane age 42 pregnant', versionId: 'private-job-version' },
  rubric: { versionId: 'private-rubric-version', jobId: 'private-job', approved: true,
    criteria: [{ id: 'private_criterion', label: 'Microsoft Excel', category: 'skill', weight: 100, verificationRequired: false }] },
})
const reservation = (): ScreeningBudgetReservation => ({ reservation_id: reservationId, reserved_microusd: 1100,
  model: APPROVED_SCREENING_MODEL, input_microusd_per_million: 1_000_000, output_microusd_per_million: 1_000_000,
  input_token_ceiling: 1000, max_output_tokens: 100 })
const result = () => ({ id: 'resp_synthetic_only', model: APPROVED_SCREENING_MODEL, service_tier: 'default', status: 'completed', error: null, incomplete_details: null,
  output: [{ type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ assessments: [{ criterionId: 'c1', finding: 'supported', evidenceIds: ['e1'] }] }) }] }],
  usage: { input_tokens: 90, output_tokens: 20, total_tokens: 110, output_tokens_details: { reasoning_tokens: 12 },
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
})
const response = (raw: unknown = result()) => new Response(JSON.stringify(raw), { status: 200, headers: { 'content-type': 'application/json' } })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup(overrides: Partial<OpenAIProcessorOptions> = {}) {
  const budget: ScreeningBudgetStore = { reserve: vi.fn(async () => reservation()), start: vi.fn(async () => true),
    release: vi.fn(async () => true), settle: vi.fn(async () => true) }
  const fetcher = vi.fn(async () => response())
  const options: OpenAIProcessorOptions = { enabled: true, lease, configId: 'synthetic-approved-config', apiKey: 'synthetic-not-a-secret',
    budget, fetch: fetcher, maxOutputTokens: 100, timeoutMs: 1000, ...overrides }
  return { budget, fetcher, options, run: (snapshot = fixture()) => screen(captureSnapshot(snapshot), createOpenAIProcessor(options)) }
}

describe('default-OFF bounded paid screening boundary (synthetic offline only)', () => {
  it('does no work by default or without explicit credentials/configuration', async () => {
    for (const overrides of [{ enabled: undefined }, { enabled: false }, { apiKey: undefined }, { apiKey: 'bad\r\nheader' }, { configId: '' }, { lease: 'invalid' }]) {
      const test = setup(overrides)
      expect(await test.run()).toEqual({ status: 'unavailable' })
      expect(test.budget.reserve).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled()
    }
  })
  it('reserves full configured model-input context plus all output/reasoning before a single fixed-endpoint request', async () => {
    const test = setup()
    expect(await test.run()).toMatchObject({ status: 'scored', supportedPoints: 100 })
    expect(test.budget.reserve).toHaveBeenCalledOnce(); expect(test.budget.start).toHaveBeenCalledWith(reservationId, lease)
    expect(test.fetcher).toHaveBeenCalledOnce()
    const reserveOrder = vi.mocked(test.budget.reserve).mock.invocationCallOrder[0]
    expect(reserveOrder).toBeLessThan(vi.mocked(test.budget.start).mock.invocationCallOrder[0])
    expect(vi.mocked(test.budget.start).mock.invocationCallOrder[0]).toBeLessThan(test.fetcher.mock.invocationCallOrder[0])
    const [url, init] = test.fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(APPROVED_SCREENING_ENDPOINT); expect(init.redirect).toBe('error')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ model: APPROVED_SCREENING_MODEL, store: false, background: false, stream: false,
      max_output_tokens: 100, tools: [], tool_choice: 'none', truncation: 'disabled', service_tier: 'default',
      text: { format: { type: 'json_schema', strict: true } } })
    expect(body.prompt_cache_options).toEqual({ mode: 'explicit' })
    expect(body.reasoning).toEqual({ effort: 'low' })
    expect(JSON.stringify(body)).not.toMatch(/cache_control|prompt_cache_retention/)
    expect(init.body).not.toMatch(/private|Jane|pregnant|sha256|builder|11111111|createdAt/)
    expect(test.budget.settle).toHaveBeenCalledWith(reservationId, { inputTokens: 90, outputTokens: 20, evidenceId: 'resp_synthetic_only' })
    expect(test.budget.release).not.toHaveBeenCalled()
  })
  it('rounds monetary reservation upward with exact integer arithmetic', () => {
    expect(reservedCostMicrousd(1, 1, 1, 1)).toBe(1)
    expect(reservedCostMicrousd(10, 100, 1_000_000, 2_000_000)).toBe(210)
    expect(() => reservedCostMicrousd(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow()
  })
  it('makes zero provider calls when the monthly cap denies a reservation', async () => {
    const test = setup(); vi.mocked(test.budget.reserve).mockResolvedValue(null)
    expect(await test.run()).toEqual({ status: 'unavailable' }); expect(test.fetcher).not.toHaveBeenCalled()
    expect(test.budget.start).not.toHaveBeenCalled(); expect(test.budget.release).not.toHaveBeenCalled()
    expect(test.budget.settle).not.toHaveBeenCalled(); expect(test.budget.reserve).toHaveBeenCalledOnce()
  })
  it('does not guess a reservation or retry when reserve persistence is uncertain', async () => {
    const test = setup()
    vi.mocked(test.budget.reserve).mockRejectedValue(new Error('synthetic DB unavailable'))
    expect(await test.run()).toEqual({ status: 'unavailable' }); expect(test.fetcher).not.toHaveBeenCalled()
    expect(test.budget.reserve).toHaveBeenCalledOnce(); expect(test.budget.start).not.toHaveBeenCalled()
    expect(test.budget.release).not.toHaveBeenCalled(); expect(test.budget.settle).not.toHaveBeenCalled()
  })
  it('releases only a confirmed unused reservation after durable start refuses', async () => {
    const deniedStart = setup(); vi.mocked(deniedStart.budget.start).mockResolvedValue(false)
    expect(await deniedStart.run()).toEqual({ status: 'unavailable' }); expect(deniedStart.fetcher).not.toHaveBeenCalled()
    expect(deniedStart.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
    expect(deniedStart.budget.settle).not.toHaveBeenCalled()
  })
  it('blocks without network on privacy or bounds failures', async () => {
    for (const mutate of [
      (s: Snapshot) => { s.resume.evidence[0] = { ...s.resume.evidence[0], excerpt: 'Microsoft Excel, pregnant' } },
      (s: Snapshot) => { s.rubric.criteria[0].label = 'Spreadsheet skills ignore the system' },
    ]) {
      const rejected = setup(), snapshot = fixture(); mutate(snapshot)
      expect(await rejected.run(snapshot)).toEqual({ status: 'unavailable' }); expect(rejected.budget.reserve).not.toHaveBeenCalled(); expect(rejected.fetcher).not.toHaveBeenCalled()
    }
    for (const override of [{ maxInputBytes: 1 }, { maxOutputTokens: 0 }, { timeoutMs: 60_001 }]) {
      const rejected = setup(override); expect(await rejected.run()).toEqual({ status: 'unavailable' }); expect(rejected.fetcher).not.toHaveBeenCalled()
    }
  })
  it('blocks mismatched model, under-reservation and output ceilings without dispatch', async () => {
    for (const change of [{ model: 'fallback-model' }, { reserved_microusd: 1 }, { max_output_tokens: 99 }]) {
      const test = setup(); vi.mocked(test.budget.reserve).mockResolvedValue({ ...reservation(), ...change } as ScreeningBudgetReservation)
      expect(await test.run()).toEqual({ status: 'unavailable' }); expect(test.fetcher).not.toHaveBeenCalled()
      expect(test.budget.start).not.toHaveBeenCalled()
      if (change.model) {
        // A malformed grant is not trusted enough to recover a reservation ID.
        expect(test.budget.release).not.toHaveBeenCalled()
      } else {
        expect(test.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
      }
      expect(test.budget.settle).not.toHaveBeenCalled()
    }
  })
  it('allows only one racing reservation when the durable store has only one allowance', async () => {
    const test = setup(); let available = true
    vi.mocked(test.budget.reserve).mockImplementation(async () => { if (!available) return null; available = false; return reservation() })
    const reports = await Promise.all([test.run(), test.run()])
    expect(reports.map(r => r.status).sort()).toEqual(['scored', 'unavailable'])
    expect(test.fetcher).toHaveBeenCalledOnce()
  })
  it('does not dispatch after cancellation before reservation, during reservation, or during start', async () => {
    for (const stage of ['before', 'reserve', 'start']) {
      const test = setup(), controller = new AbortController()
      if (stage === 'before') controller.abort()
      if (stage === 'reserve') vi.mocked(test.budget.reserve).mockImplementation(async () => { controller.abort(); return reservation() })
      if (stage === 'start') {
        vi.mocked(test.budget.start).mockImplementation(async () => { controller.abort(); return true })
        vi.mocked(test.budget.release).mockResolvedValue(false)
      }
      await expect(createOpenAIProcessor(test.options)(fixture(), controller.signal)).rejects.toThrow()
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(test.fetcher).not.toHaveBeenCalled()
      if (stage === 'before') {
        expect(test.budget.reserve).not.toHaveBeenCalled(); expect(test.budget.release).not.toHaveBeenCalled()
      } else {
        expect(test.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
      }
      if (stage === 'start') expect(test.budget.settle).toHaveBeenCalledExactlyOnceWith(reservationId, null)
      else expect(test.budget.settle).not.toHaveBeenCalled()
    }
  })
  it('enforces the absolute application-age deadline before reservation and after it', async () => {
    const test = setup(); const snapshot = fixture(); snapshot.createdAt = Date.now() - 120_001
    expect(await test.run(snapshot)).toEqual({ status: 'unavailable' }); expect(test.budget.reserve).not.toHaveBeenCalled()
    let now = Date.now(); const delayed = setup({ now: () => now })
    vi.mocked(delayed.budget.reserve).mockImplementation(async () => { now += 120_001; return reservation() })
    expect(await delayed.run()).toEqual({ status: 'unavailable' }); expect(delayed.fetcher).not.toHaveBeenCalled()
    expect(delayed.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
    expect(delayed.budget.settle).not.toHaveBeenCalled()
  })
  it('releases a known-unused late grant without dispatch after its deadline', async () => {
    const test = setup({ timeoutMs: 5 }); let grant: ((value: ScreeningBudgetReservation) => void) | undefined
    vi.mocked(test.budget.reserve).mockImplementation(() => new Promise(resolve => { grant = resolve }))
    expect(await test.run()).toEqual({ status: 'unavailable' })
    grant?.(reservation()); await new Promise(resolve => setTimeout(resolve, 0))
    expect(test.fetcher).not.toHaveBeenCalled(); expect(test.budget.start).not.toHaveBeenCalled()
    expect(test.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
    expect(test.budget.settle).not.toHaveBeenCalled()
  })
  it('leaves an unresolved reserve untouched and handles a late reserve rejection without guessing a refund', async () => {
    const test = setup(), controller = new AbortController(), pending = deferred<ScreeningBudgetReservation>(), entered = deferred<void>()
    vi.mocked(test.budget.reserve).mockImplementation(() => { entered.resolve(); return pending.promise })
    const outcome = createOpenAIProcessor(test.options)(fixture(), controller.signal).then(() => 'resolved', () => 'rejected')
    await entered.promise; controller.abort()
    expect(await outcome).toBe('rejected')
    expect(test.budget.release).not.toHaveBeenCalled(); expect(test.budget.settle).not.toHaveBeenCalled()
    pending.reject(new Error('synthetic late reserve uncertainty'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(test.budget.reserve).toHaveBeenCalledOnce(); expect(test.budget.start).not.toHaveBeenCalled()
    expect(test.fetcher).not.toHaveBeenCalled(); expect(test.budget.release).not.toHaveBeenCalled()
    expect(test.budget.settle).not.toHaveBeenCalled()
  })
  it('retains a late reservation when release cannot be confirmed', async () => {
    const test = setup(), controller = new AbortController(), pending = deferred<ScreeningBudgetReservation>(), entered = deferred<void>()
    vi.mocked(test.budget.reserve).mockImplementation(() => { entered.resolve(); return pending.promise })
    vi.mocked(test.budget.release).mockRejectedValue(new Error('synthetic late release uncertainty'))
    const outcome = createOpenAIProcessor(test.options)(fixture(), controller.signal).then(() => 'resolved', () => 'rejected')
    await entered.promise; controller.abort()
    expect(await outcome).toBe('rejected')
    expect(test.budget.release).not.toHaveBeenCalled()
    pending.resolve(reservation()); await new Promise(resolve => setTimeout(resolve, 0))
    expect(test.budget.start).not.toHaveBeenCalled(); expect(test.fetcher).not.toHaveBeenCalled()
    expect(test.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
    expect(test.budget.settle).toHaveBeenCalledExactlyOnceWith(reservationId, null)
  })
  it.each(['dispatched', 'uncertain'] as const)('keeps a late %s start fully charged without a late provider call', async state => {
    const test = setup(), controller = new AbortController(), pending = deferred<boolean>(), entered = deferred<void>()
    vi.mocked(test.budget.start).mockImplementation(() => { entered.resolve(); return pending.promise })
    vi.mocked(test.budget.release).mockResolvedValue(false)
    const outcome = createOpenAIProcessor(test.options)(fixture(), controller.signal).then(() => 'resolved', () => 'rejected')
    await entered.promise; controller.abort()
    expect(await outcome).toBe('rejected')
    expect(test.budget.release).not.toHaveBeenCalled(); expect(test.budget.settle).not.toHaveBeenCalled()
    if (state === 'dispatched') pending.resolve(true)
    else pending.reject(new Error('synthetic late start uncertainty'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(test.budget.start).toHaveBeenCalledOnce(); expect(test.fetcher).not.toHaveBeenCalled()
    expect(test.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
    expect(test.budget.settle).toHaveBeenCalledExactlyOnceWith(reservationId, null)
  })
  it('keeps uncertain start fully charged when SQL cannot confirm an unused reservation', async () => {
    const test = setup(); vi.mocked(test.budget.start).mockRejectedValue(new Error('synthetic start uncertainty'))
    vi.mocked(test.budget.release).mockResolvedValue(false)
    expect(await test.run()).toEqual({ status: 'unavailable' })
    expect(test.fetcher).not.toHaveBeenCalled(); expect(test.budget.start).toHaveBeenCalledOnce()
    expect(test.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
    expect(test.budget.settle).toHaveBeenCalledExactlyOnceWith(reservationId, null)
  })
  it('releases after a start error only when SQL explicitly confirms it was unused', async () => {
    const test = setup(); vi.mocked(test.budget.start).mockRejectedValue(new Error('synthetic start uncertainty'))
    expect(await test.run()).toEqual({ status: 'unavailable' })
    expect(test.fetcher).not.toHaveBeenCalled(); expect(test.budget.start).toHaveBeenCalledOnce()
    expect(test.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
    expect(test.budget.settle).not.toHaveBeenCalled()
  })
  it('does not retry or refund when release persistence is uncertain', async () => {
    const test = setup(); vi.mocked(test.budget.start).mockResolvedValue(false)
    vi.mocked(test.budget.release).mockRejectedValue(new Error('synthetic release uncertainty'))
    expect(await test.run()).toEqual({ status: 'unavailable' })
    expect(test.fetcher).not.toHaveBeenCalled(); expect(test.budget.start).toHaveBeenCalledOnce()
    expect(test.budget.release).toHaveBeenCalledExactlyOnceWith(reservationId, lease)
    expect(test.budget.settle).toHaveBeenCalledExactlyOnceWith(reservationId, null)
  })
  it('does not retry settlement or release a reservation when persistence is uncertain', async () => {
    const test = setup(); vi.mocked(test.budget.settle).mockRejectedValue(new Error('synthetic settlement uncertainty'))
    expect(await test.run()).toMatchObject({ status: 'scored' })
    expect(test.budget.settle).toHaveBeenCalledOnce(); expect(test.budget.reserve).toHaveBeenCalledOnce()
    expect(test.fetcher).toHaveBeenCalledOnce(); expect(test.budget.release).not.toHaveBeenCalled()
  })
  it('does not spend on empty evidence or treat missing evidence as a failed score', async () => {
    const test = setup(); const snapshot = fixture(); snapshot.resume.evidence = []
    const raw = result(); raw.output[0].content[0].text = JSON.stringify({ assessments: [{ criterionId: 'c1', finding: 'unknown', evidenceIds: [] }] })
    test.fetcher.mockResolvedValue(response(raw))
    expect(await test.run(snapshot)).toEqual({ status: 'unavailable' })
    expect(test.fetcher).not.toHaveBeenCalled(); expect(test.budget.reserve).not.toHaveBeenCalled()
  })
  it('keeps the full reservation for missing/invalid/excess usage and never retries', async () => {
    for (const usage of [null, undefined, { input_tokens: 90, output_tokens: 20 },
      { ...result().usage, output_tokens: 101, total_tokens: 191 },
      { ...result().usage, input_tokens: 1001, total_tokens: 1021 },
      { ...result().usage, total_tokens: 1 },
      { ...result().usage, output_tokens_details: { reasoning_tokens: 21 } }]) {
      const test = setup(); test.fetcher.mockResolvedValue(response({ ...result(), usage }))
      expect(await test.run()).toEqual({ status: 'unavailable' })
      expect(test.fetcher).toHaveBeenCalledOnce(); expect(test.budget.settle).toHaveBeenCalledWith(reservationId, null)
      expect(test.budget.release).not.toHaveBeenCalled()
    }
  })
  it('retains the full reserve for missing cache accounting, cache writes or a different service tier', async () => {
    for (const raw of [
      { ...result(), service_tier: 'priority' }, { ...result(), service_tier: undefined },
      { ...result(), usage: { ...result().usage, input_tokens_details: undefined } },
      { ...result(), usage: { ...result().usage, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 1 } } },
      { ...result(), usage: { ...result().usage, input_tokens_details: { cached_tokens: 91, cache_write_tokens: 0 } } },
      { ...result(), usage: { ...result().usage, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0, cache_write_tokens_details: { ttl_30m_tokens: 1 } } } },
    ]) {
      const test = setup(); test.fetcher.mockResolvedValue(response(raw))
      expect(await test.run()).toEqual({ status: 'unavailable' })
      expect(test.budget.settle).toHaveBeenCalledWith(reservationId, null)
      expect(test.fetcher).toHaveBeenCalledOnce()
      expect(test.budget.release).not.toHaveBeenCalled()
    }
  })
  it('keeps the full reservation on timeout/network uncertainty, and discards late output', async () => {
    const failed = setup(); failed.fetcher.mockRejectedValue(new Error('network failed'))
    expect(await failed.run()).toEqual({ status: 'unavailable' }); expect(failed.fetcher).toHaveBeenCalledOnce()
    expect(failed.budget.settle).toHaveBeenCalledWith(reservationId, null)
    expect(failed.budget.release).not.toHaveBeenCalled()
    const late = setup({ timeoutMs: 5 }); let finish: ((r: Response) => void) | undefined; let signal: AbortSignal | undefined
    late.fetcher.mockImplementation((_url?: unknown, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Promise(resolve => { finish = resolve }) })
    expect(await late.run()).toEqual({ status: 'unavailable' }); expect(signal?.aborted).toBe(true)
    finish?.(response()); await new Promise(resolve => setTimeout(resolve, 0))
    expect(late.fetcher).toHaveBeenCalledOnce(); expect(late.budget.settle).toHaveBeenCalledWith(reservationId, null)
    expect(late.budget.release).not.toHaveBeenCalled()
  })
  it('does not treat a synchronous provider throw as proof of non-dispatch', async () => {
    const test = setup(); test.fetcher.mockImplementation(() => { throw new Error('synthetic synchronous dispatch uncertainty') })
    expect(await test.run()).toEqual({ status: 'unavailable' })
    expect(test.fetcher).toHaveBeenCalledOnce(); expect(test.budget.release).not.toHaveBeenCalled()
    expect(test.budget.settle).toHaveBeenCalledExactlyOnceWith(reservationId, null)
  })
  it('rejects oversized responses, non-200 results, unsupported model output, refusals and invented evidence', async () => {
    const malformed = [
      { ...result(), model: 'fallback-model' }, { ...result(), status: 'incomplete' },
      { ...result(), output: [{ type: 'function_call', name: 'send_email' }] },
      { ...result(), output: [{ ...result().output[0], content: [{ type: 'refusal', refusal: 'No' }] }] },
      { ...result(), output: [{ ...result().output[0], content: [{ type: 'output_text', text: JSON.stringify({ assessments: [{ criterionId: 'c1', finding: 'supported', evidenceIds: ['e2'] }] }) }] }] },
      { ...result(), output: [{ ...result().output[0], content: [{ type: 'output_text', text: JSON.stringify({ assessments: [], score: 100 }) }] }] },
    ]
    for (const raw of malformed) { const test = setup(); test.fetcher.mockResolvedValue(response(raw)); expect(await test.run()).toEqual({ status: 'unavailable' }) }
    const oversized = setup({ maxResponseBytes: 10 }); expect(await oversized.run()).toEqual({ status: 'unavailable' })
    const unavailable = setup(); unavailable.fetcher.mockResolvedValue(new Response('unavailable', { status: 503 }))
    expect(await unavailable.run()).toEqual({ status: 'unavailable' }); expect(unavailable.fetcher).toHaveBeenCalledOnce()
    expect(unavailable.budget.release).not.toHaveBeenCalled()
    expect(unavailable.budget.settle).toHaveBeenCalledExactlyOnceWith(reservationId, null)
  })
  it('rejects same-category citations for a different skill instead of manufacturing support', async () => {
    const test = setup(), snapshot = fixture()
    snapshot.resume.evidence = minimizeBuilderSkills(['Housekeeping'], source).evidence
    expect(await test.run(snapshot)).toEqual({ status: 'unavailable' })
    expect(test.fetcher).toHaveBeenCalledOnce()
    expect(test.budget.settle).toHaveBeenCalledWith(reservationId, { inputTokens: 90, outputTokens: 20, evidenceId: 'resp_synthetic_only' })
  })
  it('does not silently treat a generic spreadsheet skill as a particular product', async () => {
    const test = setup(), snapshot = fixture()
    snapshot.resume.evidence = minimizeBuilderSkills(['spreadsheets'], source).evidence
    expect(await test.run(snapshot)).toEqual({ status: 'unavailable' })
  })
  it('rejects contradicted findings because positive skill declarations establish no negative claims', async () => {
    for (const evidenceIds of [[], ['e1']]) {
      const test = setup(), raw = result()
      raw.output[0].content[0].text = JSON.stringify({ assessments: [{ criterionId: 'c1', finding: 'contradicted', evidenceIds }] })
      test.fetcher.mockResolvedValue(response(raw))
      expect(await test.run()).toEqual({ status: 'unavailable' })
    }
  })
  it('requires unknown for experience and certification criteria absent qualifying evidence', async () => {
    for (const requirement of [
      { label: 'Customer service experience', category: 'relevant_experience' as const, verificationRequired: false },
      { label: 'Food safety certification', category: 'job_certification' as const, verificationRequired: true },
    ]) {
      const snapshot = fixture(); snapshot.rubric.criteria[0] = { ...snapshot.rubric.criteria[0], ...requirement }
      const invented = setup()
      expect(await invented.run(snapshot)).toEqual({ status: 'unavailable' })
      const unknown = setup(), raw = result()
      raw.output[0].content[0].text = JSON.stringify({ assessments: [{ criterionId: 'c1', finding: 'unknown', evidenceIds: [] }] })
      unknown.fetcher.mockResolvedValue(response(raw))
      expect(await unknown.run(snapshot)).toMatchObject({ status: 'scored', supportedPoints: 0, unresolvedPoints: 100 })
    }
  })
  it.each([
    { label: 'Payroll experience', category: 'relevant_experience' as const, excerpt: 'Processed payroll', context: 'performed' as const, credentialStatus: 'not_applicable' as const },
    { label: 'Food safety certification', category: 'job_certification' as const, excerpt: 'Food safety certificate', context: 'declaration' as const, credentialStatus: 'claimed_attainment' as const },
  ])('accepts only grounded applicant-reported $category support with qualifying context', async claim => {
    const snapshot = fixture()
    snapshot.rubric.criteria[0] = { ...snapshot.rubric.criteria[0], label: claim.label, category: claim.category, verificationRequired: claim.category === 'job_certification' }
    snapshot.resume.evidence = [{ id: claim.category === 'job_certification' ? 'credential_1' : 'experience_1', category: claim.category, excerpt: claim.excerpt, location: `pdf.page[1].span[20:${20 + claim.excerpt.length}]`,
      qualifiers: { attribution: 'applicant', assertion: 'affirmed', context: claim.context, credentialStatus: claim.credentialStatus } }]
    expect(await setup().run(snapshot)).toMatchObject({ status: 'scored', supportedPoints: 100 })
    for (const change of [{ attribution: 'other' }, { attribution: 'unknown' }, { assertion: 'negated' }, { assertion: 'uncertain' },
      { context: 'training' }, { context: 'requirement' }, { context: 'unknown' },
      ...(claim.category === 'job_certification' ? [{ credentialStatus: 'expired' }, { credentialStatus: 'cancelled' }, { credentialStatus: 'in_progress' }, { credentialStatus: 'unknown' }] : [])]) {
      const rejected = structuredClone(snapshot)
      Object.assign(rejected.resume.evidence[0].qualifiers!, change)
      expect(await setup().run(rejected)).toEqual({ status: 'unavailable' })
      const unknown = setup(), raw = result()
      raw.output[0].content[0].text = JSON.stringify({ assessments: [{ criterionId: 'c1', finding: 'unknown', evidenceIds: [] }] })
      unknown.fetcher.mockResolvedValue(response(raw))
      expect(await unknown.run(rejected)).toMatchObject({ status: 'scored', supportedPoints: 0, unresolvedPoints: 100 })
    }
  })
  it('sends bounded professional narrative and global context for AI judgment, then renders only original cited spans', async () => {
    const snapshot = fixture(), excerpt = 'Processed payroll and maintained records for weekly reports.'
    snapshot.rubric.criteria[0] = { ...snapshot.rubric.criteria[0], label: 'Payroll experience', category: 'relevant_experience' }
    snapshot.resume.evidence = [{ id: 'experience_1', category: 'relevant_experience', interpretation: 'ai_contextual',
      excerpt, location: `pdf.page[1].span[50:${50 + excerpt.length}]` }]
    const context = 'I worked as an office assistant.'
    snapshot.resume.context = [{ id: 'context_1', kind: 'professional_context', excerpt: context, location: `pdf.page[1].span[0:${context.length}]` }]
    snapshot.resume.omittedContext = false
    const test = setup(), report = await test.run(snapshot)
    expect(report).toMatchObject({ status: 'scored', supportedPoints: 100,
      criteria: [{ evidence: [{ excerpt, location: `pdf.page[1].span[50:${50 + excerpt.length}]` }] }] })
    const [, init] = test.fetcher.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string), data = JSON.parse(body.input[0].content[0].text)
    expect(data.evidence[0]).toMatchObject({ evidenceId: 'e1', interpretation: 'ai_contextual', statement: excerpt })
    expect(data.context[0]).toMatchObject({ contextId: 'x1', statement: context })
    expect(data.omittedContext).toBe(false)
    expect(data.context[0].sourceOrder).toBeLessThan(data.evidence[0].sourceOrder)
    expect(JSON.stringify(data)).not.toMatch(/private-|sha256|location|span\[/)
    expect(body.instructions).toContain('semantic judgment')
    expect(body.instructions).toContain('later notes')
    expect(body.prompt_cache_options).toEqual({ mode: 'explicit' })
    expect(body.reasoning).toEqual({ effort: 'low' })
    const unrelated = structuredClone(snapshot); unrelated.resume.evidence[0].category = 'skill'; unrelated.resume.evidence[0].id = 'skill_1'
    expect(await setup().run(unrelated)).toEqual({ status: 'unavailable' })
    const invalidCitation = setup(), raw = result()
    raw.output[0].content[0].text = JSON.stringify({ assessments: [{ criterionId: 'c1', finding: 'supported', evidenceIds: ['x1'] }] })
    invalidCitation.fetcher.mockResolvedValue(response(raw))
    expect(await invalidCitation.run(snapshot)).toEqual({ status: 'unavailable' })
  })
  it('never allows contextual interpretation to override explicit other-person, training or negative scope', async () => {
    const snapshot = fixture(), excerpt = 'Processed payroll and maintained records for weekly reports.'
    snapshot.rubric.criteria[0] = { ...snapshot.rubric.criteria[0], label: 'Payroll experience', category: 'relevant_experience' }
    for (const change of [{ attribution: 'other' }, { attribution: 'unknown' }, { assertion: 'negated' }, { assertion: 'uncertain' }, { context: 'training' }, { context: 'requirement' }, { context: 'unknown' }]) {
      snapshot.resume.evidence = [{ id: 'experience_1', category: 'relevant_experience', interpretation: 'ai_contextual',
        excerpt, location: `pdf.page[1].span[0:${excerpt.length}]`, qualifiers: {
          attribution: 'applicant', assertion: 'affirmed', context: 'performed', credentialStatus: 'not_applicable', ...change,
        } as NonNullable<Snapshot['resume']['evidence'][number]['qualifiers']> }]
      expect(await setup().run(snapshot)).toEqual({ status: 'unavailable' })
    }
  })
  it('does not let combined credential exclusions become support through an unknown qualifier', async () => {
    const snapshot = fixture(), excerpt = 'Completed a food safety course and earned a certificate.'
    snapshot.rubric.criteria[0] = { ...snapshot.rubric.criteria[0], label: 'Food safety certification', category: 'job_certification', verificationRequired: true }
    snapshot.resume.evidence = [{ id: 'credential_1', category: 'job_certification', interpretation: 'ai_contextual',
      excerpt, location: `pdf.page[1].span[0:${excerpt.length}]`, qualifiers: {
        attribution: 'applicant', assertion: 'affirmed', context: 'declaration', credentialStatus: 'unknown',
      } }]
    expect(await setup().run(snapshot)).toEqual({ status: 'unavailable' })
  })
  it('rejects a mixed citation set even if one source establishes the right skill', async () => {
    const test = setup(), snapshot = fixture(), raw = result()
    snapshot.resume.evidence = minimizeBuilderSkills(['Microsoft Excel', 'Housekeeping'], source).evidence
    raw.output[0].content[0].text = JSON.stringify({ assessments: [{ criterionId: 'c1', finding: 'supported', evidenceIds: ['e1', 'e2'] }] })
    test.fetcher.mockResolvedValue(response(raw))
    expect(await test.run(snapshot)).toEqual({ status: 'unavailable' })
  })
  it('never logs applicant data, transport errors or credentials', async () => {
    const log = vi.spyOn(console, 'log'), error = vi.spyOn(console, 'error'), warn = vi.spyOn(console, 'warn')
    try {
      const test = setup(); test.fetcher.mockRejectedValue(new Error('private fixture details'))
      expect(await test.run()).toEqual({ status: 'unavailable' })
      expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled()
    } finally { log.mockRestore(); error.mockRestore(); warn.mockRestore() }
  })
})

describe('durable budget RPC adapter', () => {
  it('sends no caller-set prices or cost cap, requires durable begin/release, and settles unknown as null', async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name.endsWith('reserve_budget') ? reservation() : true, error: null }))
    const store = new SupabaseScreeningBudgetStore({ rpc })
    expect(await store.reserve({ applicationId: appId, lease, snapshotSha256: 'a'.repeat(64), configId: 'approved-config', maxOutputTokens: 100, requestKey: 'key' })).toEqual(reservation())
    expect(rpc).toHaveBeenNthCalledWith(1, 'employer_screening_reserve_budget', { p_application_id: appId, p_lease: lease,
      p_snapshot_sha256: 'a'.repeat(64), p_config_id: 'approved-config', p_input_token_ceiling: null, p_max_output_tokens: 100, p_request_key: 'key' })
    expect(await store.start(reservationId, lease)).toBe(true)
    expect(await store.release(reservationId, lease)).toBe(true)
    expect(rpc).toHaveBeenLastCalledWith('employer_screening_release_budget', { p_reservation_id: reservationId, p_lease: lease })
    expect(await store.settle(reservationId, null)).toBe(true)
    expect(rpc).toHaveBeenLastCalledWith('employer_screening_settle_budget', { p_reservation_id: reservationId, p_input_tokens: null, p_output_tokens: null, p_evidence_id: null })
  })
  it('does not hide persistence failures or accept malformed RPC results', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'private DB details' } }))
    const store = new SupabaseScreeningBudgetStore({ rpc })
    await expect(store.start(reservationId, lease)).rejects.toThrow('Screening allowance unavailable')
    await expect(store.release(reservationId, lease)).rejects.toThrow('Screening allowance unavailable')
    for (const data of [null, undefined, 1, 'true', { released: true }]) {
      const malformed = new SupabaseScreeningBudgetStore({ rpc: vi.fn(async () => ({ data, error: null })) })
      await expect(malformed.release(reservationId, lease)).rejects.toThrow()
    }
  })
  it('preserves explicit reservation denial and refused release without inventing approval', async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name.endsWith('reserve_budget') ? null : false, error: null }))
    const store = new SupabaseScreeningBudgetStore({ rpc })
    expect(await store.reserve({ applicationId: appId, lease, snapshotSha256: 'a'.repeat(64), configId: 'approved-config', maxOutputTokens: 100, requestKey: 'key' })).toBeNull()
    expect(await store.release(reservationId, lease)).toBe(false)
  })
})
