/** Default-OFF Sol boundary. One count request and one generation, never retries.
 * Counted inputs and generation share immutable serialized content. An uncertain
 * generation/settlement retains the full shared-ledger hold, never a refund.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { reservedCostMicrousd, type ScreeningUsage } from './provider'
import { buildResumeReviewV2Request, validateResumeReviewV2, type ReviewV2Context, type ResumeReviewV2 } from './review-v2'

export const SOL_REVIEW_MODEL = 'gpt-6.1-sol' as const
export const SOL_REVIEW_MAX_INPUT_TOKENS = 16_000
export const SOL_REVIEW_MAX_OUTPUT_TOKENS = 2048
export const SOL_REVIEW_INPUT_RATE_FLOOR = 5_500_000
export const SOL_REVIEW_OUTPUT_RATE_FLOOR = 16_500_000
const endpoint = 'https://api.openai.com/v1/responses'
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const reservationSchema = z.object({
  reservation_id: z.uuid(), reserved_microusd: integer.positive(), model: z.literal(SOL_REVIEW_MODEL),
  input_microusd_per_million: integer.min(SOL_REVIEW_INPUT_RATE_FLOOR),
  output_microusd_per_million: integer.min(SOL_REVIEW_OUTPUT_RATE_FLOOR),
  input_token_ceiling: integer.positive().max(SOL_REVIEW_MAX_INPUT_TOKENS),
  max_output_tokens: z.literal(SOL_REVIEW_MAX_OUTPUT_TOKENS),
  request_sha256: z.string().regex(/^[0-9a-f]{64}$/), config_id: z.string(),
  reasoning_effort: z.literal('low'), service_tier: z.literal('default'),
  token_count_source: z.literal('responses_input_tokens'),
  dispatch_not_after: z.iso.datetime({ offset: true }),
}).strict()
export type SolReviewReservation = z.infer<typeof reservationSchema>
export type SolReviewReserveInput = Readonly<{
  applicationId: string; sourceSha256: string; configId: string; inputTokenCount: number;
  requestSha256: string; requestKey: string;
}>
export type SolReviewClaimInput = Omit<SolReviewReserveInput, 'inputTokenCount' | 'requestKey'>
export interface SolReviewBudgetStore {
  claim(input: SolReviewClaimInput): Promise<boolean>
  countAllowed(): boolean
  reserve(input: SolReviewReserveInput): Promise<unknown | null>
  dispatchAllowed(reservationId: string): boolean
  settle(reservationId: string, usage: ScreeningUsage | null): Promise<boolean>
}
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> }
}
export class SupabaseSolReviewBudgetStore implements SolReviewBudgetStore {
  private claimed = false
  private preflightNonce: string | undefined
  private claimedRequestSha256: string | undefined
  private countNotAfter = 0
  private attempted = false
  private reservationId: string | undefined
  private dispatchNotAfter = 0
  constructor(private readonly client: RpcClient, private readonly options: {
    applicantUserId: string; deadline: number; signal: AbortSignal; now?: () => number;
  }) {}
  private live() {
    if (this.options.signal.aborted || (this.options.now ?? Date.now)() >= this.options.deadline) throw new Error('Review deadline')
  }
  async claim(input: SolReviewClaimInput): Promise<boolean> {
    this.live()
    if (this.claimed) return false
    this.claimed = true
    const { data, error } = await this.client.rpc('employer_screening_claim_review_v2', {
      p_application_id: input.applicationId, p_applicant_user_id: this.options.applicantUserId,
      p_snapshot_sha256: input.sourceSha256, p_config_id: input.configId,
      p_request_sha256: input.requestSha256, p_deadline: new Date(this.options.deadline).toISOString(),
    }).abortSignal(this.options.signal)
    this.live()
    if (error) throw new Error('Review admission unavailable')
    if (data === null) return false
    const claim = z.object({ preflight_nonce: z.uuid(), dispatch_not_after: z.iso.datetime({ offset: true }) }).strict().parse(data)
    this.preflightNonce = claim.preflight_nonce
    this.claimedRequestSha256 = input.requestSha256
    this.countNotAfter = Math.min(this.options.deadline, Date.parse(claim.dispatch_not_after))
    return this.countAllowed()
  }
  countAllowed(): boolean {
    return !!this.preflightNonce && !this.options.signal.aborted && (this.options.now ?? Date.now)() < this.countNotAfter
  }
  async reserve(input: SolReviewReserveInput): Promise<unknown | null> {
    this.live()
    if (this.attempted || !this.countAllowed() || input.requestSha256 !== this.claimedRequestSha256) return null
    this.attempted = true
    const { data, error } = await this.client.rpc('employer_screening_begin_inline_v2', {
      p_application_id: input.applicationId, p_applicant_user_id: this.options.applicantUserId,
      p_snapshot_sha256: input.sourceSha256, p_config_id: input.configId, p_model: SOL_REVIEW_MODEL,
      p_input_token_count: input.inputTokenCount, p_max_output_tokens: SOL_REVIEW_MAX_OUTPUT_TOKENS,
      p_request_key: input.requestKey, p_request_sha256: input.requestSha256, p_preflight_nonce: this.preflightNonce,
      p_deadline: new Date(this.options.deadline).toISOString(),
    }).abortSignal(this.options.signal)
    this.live()
    if (error) throw new Error('Review budget unavailable')
    if (data === null) return null
    const grant = reservationSchema.parse(data)
    this.reservationId = grant.reservation_id
    this.dispatchNotAfter = Math.min(this.options.deadline, Date.parse(grant.dispatch_not_after))
    return grant
  }
  dispatchAllowed(reservationId: string): boolean {
    return reservationId === this.reservationId && !this.options.signal.aborted &&
      (this.options.now ?? Date.now)() < this.dispatchNotAfter
  }
  async settle(reservationId: string, usage: ScreeningUsage | null): Promise<boolean> {
    this.live()
    if (reservationId !== this.reservationId) return false
    const { data, error } = await this.client.rpc('employer_screening_settle_inline', {
      p_reservation_id: reservationId, p_input_tokens: usage?.inputTokens ?? null,
      p_output_tokens: usage?.outputTokens ?? null, p_evidence_id: usage?.evidenceId ?? null,
    }).abortSignal(this.options.signal)
    this.live()
    if (error) throw new Error('Review settlement unavailable')
    return z.boolean().parse(data)
  }
}
export type SolReviewStage = 'admission_requested' | 'admission_granted' | 'admission_denied' | 'count_started' | 'count_validated' | 'budget_requested' | 'budget_granted' | 'provider_request_started' | 'settlement_confirmed' | 'validation_retry'
export type SolReviewOptions = Readonly<{
  enabled: boolean; apiKey?: string; configId: string; applicationId: string; sourceSha256: string;
  deadline: number; signal: AbortSignal; budget: SolReviewBudgetStore;
  fetch?: typeof fetch; now?: () => number; onStage?: (stage: SolReviewStage) => void;
}>
async function readResponse(response: Response, maximum: number, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || response.redirected || !response.body) throw new Error('Review response unavailable')
  const length = response.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new Error('Review response limit')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      if (signal.aborted) throw new Error('Review cancelled')
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) throw new Error('Review response limit')
      chunks.push(value)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock() }
}
function usageFrom(raw: unknown, grant: SolReviewReservation): ScreeningUsage | null {
  const result = z.object({ id: z.string().regex(/^resp_[a-zA-Z0-9_-]{1,200}$/),
    model: z.literal(SOL_REVIEW_MODEL), service_tier: z.literal('default'), usage: z.object({
      input_tokens: integer.positive(), output_tokens: integer, total_tokens: integer,
      input_tokens_details: z.object({ cached_tokens: integer, cache_write_tokens: z.literal(0),
        cache_write_tokens_details: z.record(z.string(), z.literal(0)).optional() }),
      output_tokens_details: z.object({ reasoning_tokens: integer }),
    }),
  }).safeParse(raw)
  if (!result.success) return null
  const u = result.data.usage
  if (u.input_tokens > grant.input_token_ceiling || u.output_tokens > grant.max_output_tokens ||
      u.total_tokens !== u.input_tokens + u.output_tokens || u.input_tokens_details.cached_tokens > u.input_tokens ||
      u.output_tokens_details.reasoning_tokens > u.output_tokens) return null
  return { inputTokens: u.input_tokens, outputTokens: u.output_tokens, evidenceId: result.data.id }
}
function outputFrom(raw: unknown): unknown {
  const envelope = z.object({ model: z.literal(SOL_REVIEW_MODEL), status: z.literal('completed'),
    error: z.null(), incomplete_details: z.null(), output: z.array(z.union([
      z.object({ type: z.literal('message'), status: z.literal('completed'), role: z.literal('assistant'),
        content: z.array(z.object({ type: z.literal('output_text'), text: z.string().max(32_000) })).length(1) }),
      z.object({ type: z.literal('reasoning') }),
    ])).min(1).max(4),
  }).parse(raw)
  const messages = envelope.output.filter(item => item.type === 'message')
  if (messages.length !== 1) throw new Error('Review output unavailable')
  return JSON.parse(messages[0].content[0].text)
}
/** Failures that are properties of the sampled response rather than the
 * request or the transport: the validator's constant rule messages, the
 * response schema rejection, and the response shape failures. A fresh
 * generation can plausibly satisfy all of them; nothing else is retried. */
const RETRYABLE_REVIEW_FAILURES = new Set([
  'Review output unavailable', 'Résumé review response limit',
  'Invalid review scope', 'Unknown, duplicate or non-assessable review citation',
  'Incomplete review dimensions', 'Unknown dimension must be unscored',
  'Dimension requires evidence and role scope',
  'Missing evidence cannot be inferred from incomplete input',
  'Observed dimension requires a source', 'Text quality is separate from role evidence',
  'Highlight requires professional and role evidence',
  'Gap requires role scope and a single verification question',
  'Evidence limitation requires a source',
  'Duplicate or conflicting review claims', 'Duplicate verification questions',
  'No professional input permits only an insufficient-scope review',
  'Overview requires an admitted professional source',
])
function isRetryableReviewFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'ZodError') return true
  return RETRYABLE_REVIEW_FAILURES.has(error.message)
}

/** Returns only after usage settlement and narrative validation both succeed.
 * Billing rates are conservative ceilings, not a claim of invoice reconciliation.
 * The count endpoint's price is not independently documented as free; activation
 * requires reviewing that commercial assumption alongside the verified rate card.
 */
export async function runSolResumeReview(context: ReviewV2Context, options: SolReviewOptions): Promise<ResumeReviewV2> {
  if (!options.enabled || !options.apiKey || /[\r\n]/.test(options.apiKey)) throw new Error('Review disabled')
  z.uuid().parse(options.applicationId)
  z.string().regex(/^[0-9a-f]{64}$/).parse(options.sourceSha256)
  // Config IDs are opaque SQL keys; reviewed model-version IDs include periods.
  z.string().regex(/^[a-z0-9_.-]{1,100}$/).parse(options.configId)
  const now = options.now ?? Date.now
  const live = () => { if (options.signal.aborted || !Number.isFinite(options.deadline) || now() >= options.deadline) throw new Error('Review deadline') }
  const stage = (event: SolReviewStage) => { try { options.onStage?.(event) } catch { /* diagnostics cannot alter flow */ } }
  live()
  const request = buildResumeReviewV2Request(context)
  // Exactly these token-bearing fields are shared by count and generation. No
  // conversation state, files, retrieval, tools or second-stage prompt is added.
  const shared = { model: SOL_REVIEW_MODEL, instructions: request.instructions,
    input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(request.input) }] }],
    reasoning: { effort: 'low' }, tools: [], tool_choice: 'none', truncation: 'disabled',
    text: { format: { type: 'json_schema', name: 'resume_review_v2', strict: true, schema: request.schema } },
  }
  const countedBody = JSON.stringify(shared)
  const generationBody = JSON.stringify({ ...shared, max_output_tokens: SOL_REVIEW_MAX_OUTPUT_TOKENS,
    store: false, background: false, stream: false, service_tier: 'default', prompt_cache_options: { mode: 'explicit' } })
  if (Buffer.byteLength(generationBody, 'utf8') > 64_000) throw new Error('Review input limit')
  const requestSha256 = hash(generationBody)
  const send = (url: string, body: string) => (options.fetch ?? globalThis.fetch)(url, {
    method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' }, body, signal: options.signal,
  })
  let grant: SolReviewReservation | undefined, usage: ScreeningUsage | null = null
  let settled = false, settlementAttempted = false
  try {
    live(); stage('admission_requested')
    const admitted = await options.budget.claim({ applicationId: options.applicationId, sourceSha256: options.sourceSha256,
      configId: options.configId, requestSha256 })
    live()
    if (!admitted) { stage('admission_denied'); throw new Error('Review admission unavailable') }
    stage('admission_granted')
    live()
    if (!options.budget.countAllowed()) throw new Error('Review admission expired')
    // Consume-before-count uniqueness and final synchronous deadline fence.
    const counting = send(`${endpoint}/input_tokens`, countedBody)
    stage('count_started')
    const count = z.object({ object: z.literal('response.input_tokens'), input_tokens: integer.positive().max(SOL_REVIEW_MAX_INPUT_TOKENS) })
      .strict().parse(await readResponse(await counting, 4096, options.signal)).input_tokens
    live(); stage('count_validated')
    stage('budget_requested')
    const candidate = await options.budget.reserve({ applicationId: options.applicationId, sourceSha256: options.sourceSha256,
      configId: options.configId, inputTokenCount: count, requestSha256,
      requestKey: `screening-v2/${options.applicationId}/${requestSha256}` })
    live()
    if (candidate === null) { stage('admission_denied'); throw new Error('Review budget unavailable') }
    grant = reservationSchema.parse(candidate)
    if (grant.input_token_ceiling !== count || grant.config_id !== options.configId || grant.request_sha256 !== requestSha256 ||
        grant.reserved_microusd !== reservedCostMicrousd(count, SOL_REVIEW_MAX_OUTPUT_TOKENS,
          grant.input_microusd_per_million, grant.output_microusd_per_million)) throw new Error('Review allowance mismatch')
    stage('budget_granted')
    live()
    if (now() >= Date.parse(grant.dispatch_not_after) || !options.budget.dispatchAllowed(grant.reservation_id)) throw new Error('Review dispatch expired')
    const activeGrant = grant
    const generate = async () => {
      const pending = send(endpoint, generationBody)
      stage('provider_request_started')
      const raw = await readResponse(await pending, 64_000, options.signal)
      live()
      const attemptUsage = usageFrom(raw, activeGrant)
      if (!attemptUsage) throw new Error('Review usage unavailable')
      usage = attemptUsage
      const result = validateResumeReviewV2(context, outputFrom(raw))
      live()
      return result
    }
    // No await/log/callback between the final synchronous fence and the first
    // generation dispatch: generate() runs synchronously up to its fetch.
    let reviewed: ReturnType<typeof validateResumeReviewV2>
    try {
      reviewed = await generate()
    } catch (error) {
      // One fresh generation for a validation class rejection, inside the
      // same admission and reservation and inside the same dispatch window.
      // Transport, admission, budget, and deadline failures are not retried,
      // and a second failure propagates with its own reason.
      if (!isRetryableReviewFailure(error) || now() >= Date.parse(activeGrant.dispatch_not_after)) throw error
      live(); stage('validation_retry')
      reviewed = await generate()
    }
    settlementAttempted = true
    // Settlement is accounting, not part of the review's value: a failed or
    // refused settlement must not discard a validated, already-paid review.
    // The reservation's durable hold remains for reconciliation either way.
    try { settled = await options.budget.settle(grant.reservation_id, usage) } catch { settled = false }
    if (settled) stage('settlement_confirmed')
    return reviewed
  } finally {
    if (grant && !settlementAttempted) {
      try { await options.budget.settle(grant.reservation_id, usage) } catch { /* full durable hold remains */ }
    }
  }
}
