// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { runSolResumeReview, SupabaseSolReviewBudgetStore, SOL_REVIEW_MODEL,
  SOL_REVIEW_MAX_OUTPUT_TOKENS, type SolReviewBudgetStore, type SolReviewReservation } from '../src/lib/employer-screening/review-v2-provider'
import type { ReviewV2Context } from '../src/lib/employer-screening/review-v2'
import { reservedCostMicrousd } from '../src/lib/employer-screening/provider'
vi.mock('../src/lib/employer-screening/review-v2', () => ({
  buildResumeReviewV2Request: () => ({ instructions: 'Synthetic instructions only.', input: { records: [{ id: 'r1', text: 'Synthetic work only.' }] },
    schema: { type: 'object', additionalProperties: false, properties: { synthetic: { type: 'boolean' } }, required: ['synthetic'] } }),
  validateResumeReviewV2: (_context: unknown, raw: unknown) => {
    if (!(raw as { synthetic?: boolean })?.synthetic) throw new Error('Invalid synthetic review')
    return { version: 'synthetic-test' }
  },
}))
const applicationId = '11111111-1111-4111-8111-111111111111'
const reservationId = '22222222-2222-4222-8222-222222222222'
const sourceSha256 = 'a'.repeat(64)
// Exact non-secret ID seeded by the reviewed production migration.
const productionConfigId = 'gpt-6.1-sol-20261022-counted-v2'
const context = {} as ReviewV2Context
const raw = () => ({ id: 'resp_synthetic_review', model: SOL_REVIEW_MODEL, service_tier: 'default', status: 'completed', error: null, incomplete_details: null,
  output: [{ type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: '{"synthetic":true}' }] }],
  usage: { input_tokens: 1200, output_tokens: 700, total_tokens: 1900,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 100 } },
})
function setup() {
  let now = Date.parse('2026-10-22T12:00:00Z')
  const controller = new AbortController()
  const grant = (requestSha256: string): SolReviewReservation => ({ reservation_id: reservationId, model: SOL_REVIEW_MODEL,
    input_token_ceiling: 1200, max_output_tokens: SOL_REVIEW_MAX_OUTPUT_TOKENS,
    input_microusd_per_million: 5_500_000, output_microusd_per_million: 16_500_000,
    reserved_microusd: reservedCostMicrousd(1200, SOL_REVIEW_MAX_OUTPUT_TOKENS, 5_500_000, 16_500_000),
    request_sha256: requestSha256, config_id: productionConfigId, reasoning_effort: 'low', service_tier: 'default',
    token_count_source: 'responses_input_tokens', dispatch_not_after: new Date(now + 25_000).toISOString(),
  })
  const budget: SolReviewBudgetStore = {
    claim: vi.fn(async () => true), countAllowed: vi.fn(() => true),
    reserve: vi.fn(async input => grant(input.requestSha256)), dispatchAllowed: vi.fn(() => true), settle: vi.fn(async () => true),
  }
  const fetcher = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url).endsWith('/input_tokens')
    ? { object: 'response.input_tokens', input_tokens: 1200 } : raw())))
  const onStage = vi.fn()
  const options = { enabled: true, apiKey: 'synthetic-not-a-key', configId: productionConfigId, applicationId,
    sourceSha256, deadline: now + 25_000, signal: controller.signal, budget, fetch: fetcher, now: () => now, onStage }
  return { budget, fetcher, options, controller, grant, advance: (ms: number) => { now += ms }, run: () => runSolResumeReview(context, options) }
}
describe('Sol v2 single-call budget boundary (offline mocks only)', () => {
  it('accepts the exact production config ID, counts the same request and sends one generation', async () => {
    const s = setup(); expect(await s.run()).toEqual({ version: 'synthetic-test' })
    expect(s.fetcher).toHaveBeenCalledTimes(2)
    expect(s.budget.claim).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ configId: productionConfigId }))
    const [countCall, generateCall] = s.fetcher.mock.calls
    expect(countCall[0]).toBe('https://api.openai.com/v1/responses/input_tokens')
    expect(generateCall[0]).toBe('https://api.openai.com/v1/responses')
    const counted = JSON.parse(String(countCall[1]!.body)), generated = JSON.parse(String(generateCall[1]!.body))
    for (const key of Object.keys(counted)) expect(generated[key]).toEqual(counted[key])
    expect(generated).toMatchObject({ model: SOL_REVIEW_MODEL, reasoning: { effort: 'low' },
      max_output_tokens: 2048, service_tier: 'default', prompt_cache_options: { mode: 'explicit' },
      tools: [], tool_choice: 'none', truncation: 'disabled', store: false, stream: false, background: false })
    expect(JSON.stringify(generated)).not.toContain('prompt_cache_breakpoint')
    expect(counted).not.toHaveProperty('max_output_tokens')
    const requestSha = createHash('sha256').update(String(generateCall[1]!.body)).digest('hex')
    expect(s.budget.reserve).toHaveBeenCalledWith(expect.objectContaining({ inputTokenCount: 1200, requestSha256: requestSha }))
    expect(s.budget.settle).toHaveBeenCalledExactlyOnceWith(reservationId, { inputTokens: 1200, outputTokens: 700, evidenceId: 'resp_synthetic_review' })
  })
  it.each(['', 'x'.repeat(101), 'config with space', 'config/other', 'config\nother', 'CONFIG', 'config:other'])('rejects invalid config ID %j before any claim or request', async configId => {
    const s = setup(); s.options.configId = configId
    await expect(s.run()).rejects.toThrow()
    expect(s.budget.claim).not.toHaveBeenCalled(); expect(s.fetcher).not.toHaveBeenCalled()
  })
  it('does not count when admission rejects or is no longer live', async () => {
    const rejected = setup(); vi.mocked(rejected.budget.claim).mockResolvedValue(false)
    await expect(rejected.run()).rejects.toThrow(); expect(rejected.fetcher).not.toHaveBeenCalled()
    const expired = setup(); vi.mocked(expired.budget.countAllowed).mockReturnValue(false)
    await expect(expired.run()).rejects.toThrow(); expect(expired.fetcher).not.toHaveBeenCalled()
  })
  it.each([0, -1, 16_001, 1.5, '1200', null])('rejects invalid count %s without reserve or generation', async count => {
    const s = setup(); s.fetcher.mockResolvedValue(new Response(JSON.stringify({ object: 'response.input_tokens', input_tokens: count })))
    await expect(s.run()).rejects.toThrow(); expect(s.fetcher).toHaveBeenCalledTimes(1)
    expect(s.budget.reserve).not.toHaveBeenCalled()
  })
  it('does not retry a failed count or dispatch generation', async () => {
    const s = setup(); s.fetcher.mockRejectedValue(new Error('Synthetic transport error'))
    await expect(s.run()).rejects.toThrow(); expect(s.fetcher).toHaveBeenCalledTimes(1); expect(s.budget.reserve).not.toHaveBeenCalled()
  })
  it('does not dispatch when the shared budget rejects', async () => {
    const s = setup(); vi.mocked(s.budget.reserve).mockResolvedValue(null)
    await expect(s.run()).rejects.toThrow(); expect(s.fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(['hash', 'model', 'rate', 'count', 'output', 'amount', 'config'])('rejects mismatched %s grant without generation', async field => {
    const s = setup(); vi.mocked(s.budget.reserve).mockImplementation(async input => {
      const grant = { ...s.grant(input.requestSha256) } as Record<string, unknown>
      if (field === 'config') grant.config_id = 'different-review-config'
      if (field === 'hash') grant.request_sha256 = 'b'.repeat(64)
      if (field === 'model') grant.model = 'gpt-6-luna'
      if (field === 'rate') grant.input_microusd_per_million = 1
      if (field === 'count') grant.input_token_ceiling = 1199
      if (field === 'output') grant.max_output_tokens = 1024
      if (field === 'amount') grant.reserved_microusd = 1
      return grant
    })
    await expect(s.run()).rejects.toThrow(); expect(s.fetcher).toHaveBeenCalledTimes(1)
  })
  it('checks the final database cutoff before generation', async () => {
    const s = setup(); vi.mocked(s.budget.reserve).mockImplementation(async input => ({ ...s.grant(input.requestSha256), dispatch_not_after: new Date(s.options.now() - 1).toISOString() }))
    await expect(s.run()).rejects.toThrow(); expect(s.fetcher).toHaveBeenCalledTimes(1)
  })
  it('checks the synchronous adapter fence', async () => {
    const s = setup(); vi.mocked(s.budget.dispatchAllowed).mockReturnValue(false)
    await expect(s.run()).rejects.toThrow(); expect(s.fetcher).toHaveBeenCalledTimes(1)
  })
  it('never dispatches after count crosses the overall deadline', async () => {
    const s = setup(); s.fetcher.mockImplementation(async () => { s.advance(26_000); return new Response('{"object":"response.input_tokens","input_tokens":1200}') })
    await expect(s.run()).rejects.toThrow(); expect(s.budget.reserve).not.toHaveBeenCalled()
  })
  it.each(['tier', 'model', 'cache', 'overflow', 'missing'])('retains uncertain usage for %s mismatch', async failure => {
    const s = setup(); s.fetcher.mockImplementation(async url => {
      if (String(url).endsWith('/input_tokens')) return new Response('{"object":"response.input_tokens","input_tokens":1200}')
      const response = raw() as Record<string, unknown>
      if (failure === 'tier') response.service_tier = 'priority'
      if (failure === 'model') response.model = 'gpt-6.1-sol-other'
      if (failure === 'missing') delete response.usage
      if (failure === 'cache') response.usage = { ...raw().usage, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 1 } }
      if (failure === 'overflow') response.usage = { ...raw().usage, input_tokens: 1201, total_tokens: 1901 }
      return new Response(JSON.stringify(response))
    })
    await expect(s.run()).rejects.toThrow(); expect(s.fetcher).toHaveBeenCalledTimes(2)
    expect(s.budget.settle).toHaveBeenCalledExactlyOnceWith(reservationId, null)
  })
  it('does not repeat an uncertain settlement or return the report', async () => {
    const s = setup(); vi.mocked(s.budget.settle).mockRejectedValue(new Error('Uncertain settlement'))
    await expect(s.run()).rejects.toThrow(); expect(s.budget.settle).toHaveBeenCalledTimes(1)
    expect(s.fetcher).toHaveBeenCalledTimes(2)
  })
  it('ignores stage callback failures without extra requests', async () => {
    const s = setup(); s.options.onStage.mockImplementation(() => { throw new Error('Sink failed') })
    await expect(s.run()).resolves.toEqual({ version: 'synthetic-test' }); expect(s.fetcher).toHaveBeenCalledTimes(2)
  })
  it('uses only the new RPC, rejects late grants, and attempts once per store', async () => {
    const s = setup(), requestSha256 = 'b'.repeat(64)
    const nonce = '33333333-3333-4333-8333-333333333333'
    const rpc = vi.fn((name: string) => ({ abortSignal: vi.fn(async () => ({ data: name === 'employer_screening_claim_review_v2'
      ? { preflight_nonce: nonce, dispatch_not_after: new Date(s.options.deadline).toISOString() } : s.grant(requestSha256), error: null })) }))
    const store = new SupabaseSolReviewBudgetStore({ rpc }, { applicantUserId: applicationId, deadline: s.options.deadline, signal: s.controller.signal, now: s.options.now })
    const input = { applicationId, sourceSha256, configId: productionConfigId, inputTokenCount: 1200, requestSha256, requestKey: 'synthetic' }
    await expect(store.reserve(input)).resolves.toBeNull(); expect(rpc).not.toHaveBeenCalled()
    await expect(store.claim(input)).resolves.toBe(true)
    await expect(store.claim(input)).resolves.toBe(false)
    await expect(store.reserve(input)).resolves.toMatchObject({ model: SOL_REVIEW_MODEL })
    expect(rpc).toHaveBeenCalledWith('employer_screening_begin_inline_v2', expect.objectContaining({ p_model: SOL_REVIEW_MODEL, p_input_token_count: 1200, p_max_output_tokens: 2048, p_request_sha256: requestSha256, p_preflight_nonce: nonce }))
    await expect(store.reserve(input)).resolves.toBeNull(); expect(rpc).toHaveBeenCalledTimes(2)
    expect(store.dispatchAllowed(reservationId)).toBe(true); s.advance(25_000); expect(store.dispatchAllowed(reservationId)).toBe(false)
  })
})
