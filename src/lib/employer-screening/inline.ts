/** Optional, default-OFF enrichment of the existing single employer email.
 * No capture, queue, retry, second email, or résumé persistence is introduced.
 */
import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { captureSnapshot, readSnapshot, validateAssessment, type Report } from './index'
import { derivePublishedJobCriteria } from './inline-job-criteria'
import { hasCurrentScreeningNotice } from './notice'
import { extractPdfResume, PDF_EXTRACTION_LIMITS, type PdfExtractionOptions, type PdfResumeExtraction } from './pdf-extraction'
import { validateMinimizedExtraction } from './privacy'
import { createOpenAIProcessor, type ScreeningBudgetReservation, type ScreeningBudgetStore, type ScreeningUsage } from './provider'
import { assessResumeDocumentQuality, validateResumeDocumentQuality, type ResumeDocumentQuality } from './quality'
import { inlineDiagnostic, JOB_MAPPING_REASON_EVENTS, reviewV2FailureEvent, type InlineDiagnosticEvent } from './inline-diagnostics'
import { inlineResumeReviewV2 } from './review-v2-inline'
import { SupabaseSolReviewBudgetStore, type SolReviewBudgetStore } from './review-v2-provider'
import type { ResumeReviewV2 } from './review-v2'

/** Leaves the ordinary send its existing execution time. Parsing gets at most 3s. */
export const INLINE_SCREENING_BUDGET_MS = 25_000
export const INLINE_SCREENING_GATES = [
  'EMPLOYER_SCREENING_INLINE_ENABLED', 'EMPLOYER_SCREENING_PRIVACY_APPROVED',
  'EMPLOYER_SCREENING_CONTEXT_PRIVACY_APPROVED', 'EMPLOYER_SCREENING_NOTICE_APPROVED',
  'NEXT_PUBLIC_EMPLOYER_SCREENING_NOTICE_ENABLED',
] as const
export function inlineScreeningEnabled(noticeVersion: unknown, env: Record<string, string | undefined> = process.env): boolean {
  return hasCurrentScreeningNotice(noticeVersion) && INLINE_SCREENING_GATES.every(key => env[key] === 'true')
}
export type InlineScreeningFields = Readonly<{
  employer_resume_review_v2?: ResumeReviewV2
  employer_screening?: Report
  employer_resume_quality?: ResumeDocumentQuality
}>
export type InlineScreeningInput = Readonly<{
  applicationId: string; applicantUserId: string; jobId: string; companyId: string; jobTitle: string
  noticeVersion: unknown
  /** The exact existing attachment Buffer, not a second read or a re-render. */
  resumeBytes: Uint8Array
}>
export type InlineScreeningDependencies = Readonly<{
  loadJob(jobId: string, signal: AbortSignal): Promise<unknown>
  budget(input: { applicantUserId: string; deadline: number; signal: AbortSignal }): ScreeningBudgetStore
  reviewBudget?: (input: { applicantUserId: string; deadline: number; signal: AbortSignal }) => SolReviewBudgetStore
  extract?: (bytes: Uint8Array, options: PdfExtractionOptions) => Promise<PdfResumeExtraction | null>
  fetch?: typeof fetch
  env?: Record<string, string | undefined>
  now?: () => number
}>

type RpcResult = { data: unknown; error: unknown }
export interface InlineBudgetRpcClient {
  rpc(name: string, args: Record<string, unknown>): { abortSignal(signal: AbortSignal): PromiseLike<RpcResult> }
}
/** The unique application attempt is reserved AND dispatch-authorized atomically.
 * An unknown result, a late grant or a failed response always keeps the full hold.
 * It is never refunded merely because this invocation did not see a response.
 */
export class SupabaseInlineScreeningBudgetStore implements ScreeningBudgetStore {
  private reservationId: string | undefined
  private lease: string | undefined
  private dispatchNotAfter = 0
  private started = false
  private attempted = false
  constructor(private readonly client: InlineBudgetRpcClient,
    private readonly options: { applicantUserId: string; deadline: number; signal: AbortSignal; now?: () => number }) {}
  private live() {
    if (this.options.signal.aborted || (this.options.now ?? Date.now)() >= this.options.deadline) throw new Error('Inline screening deadline')
  }
  private async call(name: string, args: Record<string, unknown>) {
    this.live()
    const { data, error } = await this.client.rpc(name, args).abortSignal(this.options.signal)
    this.live()
    if (error) throw new Error('Inline allowance unavailable')
    return data
  }
  async reserve(input: Parameters<ScreeningBudgetStore['reserve']>[0]): Promise<ScreeningBudgetReservation | null> {
    if (this.attempted) return null
    this.attempted = true
    const result = await this.call('employer_screening_begin_inline', {
      p_application_id: input.applicationId, p_applicant_user_id: this.options.applicantUserId,
      p_snapshot_sha256: input.snapshotSha256, p_config_id: input.configId,
      // SQL resolves and reserves the reviewed FULL input-context bound.
      p_input_token_ceiling: null, p_max_output_tokens: input.maxOutputTokens,
      p_request_key: input.requestKey, p_deadline: new Date(this.options.deadline).toISOString(),
    })
    if (result === null) return null
    const parsed = z.object({ reservation_id: z.uuid(), dispatch_not_after: z.iso.datetime({ offset: true }) }).passthrough().parse(result)
    this.reservationId = parsed.reservation_id
    this.lease = input.lease
    this.dispatchNotAfter = Math.min(this.options.deadline, Date.parse(parsed.dispatch_not_after))
    // Only the provider's strict reservation schema may validate its paid bounds.
    const { dispatch_not_after: _deadline, ...reservation } = parsed
    void _deadline
    return reservation as ScreeningBudgetReservation
  }
  async start(reservationId: string, lease: string): Promise<boolean> {
    this.live()
    if (this.started || this.reservationId !== reservationId || this.lease !== lease ||
        (this.options.now ?? Date.now)() >= this.dispatchNotAfter) return false
    this.started = true
    return true
  }
  dispatchAllowed(): boolean {
    const now = (this.options.now ?? Date.now)()
    return this.started && !this.options.signal.aborted && now < this.options.deadline && now < this.dispatchNotAfter
  }
  async release(): Promise<boolean> { return false }
  async settle(reservationId: string, usage: ScreeningUsage | null): Promise<boolean> {
    if (reservationId !== this.reservationId) return false
    return z.boolean().parse(await this.call('employer_screening_settle_inline', {
      p_reservation_id: reservationId, p_input_tokens: usage?.inputTokens ?? null,
      p_output_tokens: usage?.outputTokens ?? null, p_evidence_id: usage?.evidenceId ?? null,
    }))
  }
}

const jobSchema = z.object({ id: z.string(), company_id: z.string(), title: z.string().min(1).max(1000),
  description: z.string(), status: z.literal('active') })

/** Fail open to the already-built email. Completed local document observations
 * are independent of job-match availability. Late parsing/provider output never
 * becomes part of this email, and no continuations may initiate a late request.
 */
export async function inlineEmployerScreening(input: InlineScreeningInput, deps: InlineScreeningDependencies): Promise<InlineScreeningFields> {
  const env = deps.env ?? process.env
  const diagnostic = (event: InlineDiagnosticEvent) => inlineDiagnostic(event, input.applicationId)
  if (!inlineScreeningEnabled(input.noticeVersion, env)) {
    diagnostic(hasCurrentScreeningNotice(input.noticeVersion) ? 'entry_gates_disabled' : 'entry_notice_missing')
    return {}
  }
  if (!(input.resumeBytes instanceof Uint8Array) || !input.resumeBytes.byteLength || input.resumeBytes.byteLength > PDF_EXTRACTION_LIMITS.bytes) {
    diagnostic('attachment_invalid'); return {}
  }
  const now = deps.now ?? Date.now
  const startedAt = now(), deadline = startedAt + INLINE_SCREENING_BUDGET_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let quality: ResumeDocumentQuality | undefined
  let failureEvent: InlineDiagnosticEvent = 'parse_failed'
  // Read through a function so the catch sees assignments made inside work().
  const currentFailureEvent = (): InlineDiagnosticEvent => failureEvent
  const localOnly = (): InlineScreeningFields => quality ? { employer_resume_quality: quality } : {}
  const live = () => { if (controller.signal.aborted || now() >= deadline) throw new Error('Inline screening deadline') }
  const work = async (): Promise<InlineScreeningFields> => {
    live()
    const digest = createHash('sha256').update(input.resumeBytes).digest('hex')
    diagnostic('parse_started')
    const parsed = await (deps.extract ?? extractPdfResume)(input.resumeBytes, {
      signal: controller.signal, budgetMs: Math.max(1, Math.min(PDF_EXTRACTION_LIMITS.budgetMs, deadline - now())),
      onDiagnostic: diagnostic,
    })
    live()
    if (!parsed || parsed.sourceSha256 !== digest) { diagnostic('parse_unavailable'); return {} }
    // Choosing v2 is exclusive, including failure. Never run a paid Luna fallback
    // or relabel the old local presentation score as this narrative review.
    if (env.EMPLOYER_SCREENING_REVIEW_V2_ENABLED === 'true') {
      failureEvent = 'review_v2_failed'
      return inlineResumeReviewV2(input, parsed, deps, deadline, controller.signal)
    }
    failureEvent = 'quality_failed'
    const assessed = assessResumeDocumentQuality({ sourceSha256: parsed.sourceSha256, localPages: parsed.localPages }, digest)
    live()
    if (assessed.status === 'assessed') {
      const validated = validateResumeDocumentQuality(assessed, digest)
      live()
      quality = validated
    }
    if (env.EMPLOYER_SCREENING_BUDGET_APPROVED !== 'true' || env.EMPLOYER_SCREENING_PAID_PROVIDER_ENABLED !== 'true' ||
        !env.EMPLOYER_SCREENING_BUDGET_CONFIG_ID || !env.OPENAI_API_KEY) { diagnostic('paid_gate_disabled'); return localOnly() }
    failureEvent = 'evidence_invalid'
    const extraction = validateMinimizedExtraction({ sourceSha256: parsed.sourceSha256, evidence: parsed.evidence,
      ...(parsed.context ? { context: parsed.context } : {}),
      ...(parsed.omittedContext !== undefined ? { omittedContext: parsed.omittedContext } : {}),
    }, digest)
    if (!extraction.evidence.length) { diagnostic('evidence_empty'); return localOnly() }
    failureEvent = 'job_load_failed'
    const job = jobSchema.parse(await deps.loadJob(input.jobId, controller.signal))
    live()
    if (job.id !== input.jobId || job.company_id !== input.companyId || job.title !== input.jobTitle) { diagnostic('job_binding_mismatch'); return localOnly() }
    failureEvent = 'job_mapping_unavailable'
    const derived = derivePublishedJobCriteria(job)
    if (derived.status !== 'available') {
      diagnostic('job_mapping_unavailable')
      if (derived.reason) diagnostic(JOB_MAPPING_REASON_EVENTS[derived.reason])
      return localOnly()
    }
    failureEvent = 'snapshot_invalid'
    const frozen = captureSnapshot({
      applicationId: input.applicationId, jobId: input.jobId, companyId: input.companyId, createdAt: startedAt,
      resume: { versionId: `inline-${digest}`, sha256: digest, evidence: extraction.evidence,
        ...(extraction.context ? { context: extraction.context } : {}),
        ...(extraction.omittedContext !== undefined ? { omittedContext: extraction.omittedContext } : {}) },
      job: { title: job.title, versionId: derived.versionId },
      rubric: { versionId: derived.versionId, jobId: job.id, approved: false,
        source: 'published_job_requirements', descriptionSha256: derived.source.descriptionSha256,
        mappingVersion: derived.source.mappingVersion, omittedContext: derived.source.omittedContext,
        jobContext: derived.source.context.map(({ text, sourceOrder }) => ({ text, sourceOrder })), criteria: derived.criteria },
    })
    live()
    const budget = deps.budget({ applicantUserId: input.applicantUserId, deadline, signal: controller.signal })
    let settlementConfirmed = false
    failureEvent = 'provider_preflight_failed'
    const processor = createOpenAIProcessor({ enabled: true, lease: randomUUID(),
      configId: env.EMPLOYER_SCREENING_BUDGET_CONFIG_ID, apiKey: env.OPENAI_API_KEY,
      budget: {
        reserve: async request => {
          failureEvent = 'budget_rpc_failed'; diagnostic('budget_requested')
          const reservation = await budget.reserve(request)
          failureEvent = reservation ? 'provider_preflight_failed' : 'budget_rejected'
          if (reservation) diagnostic('budget_granted')
          return reservation
        },
        start: async (id, lease) => {
          failureEvent = 'dispatch_not_authorized'
          return budget.start(id, lease)
        },
        ...(budget.dispatchAllowed ? { dispatchAllowed: () => budget.dispatchAllowed!() } : {}),
        release: (id, lease) => budget.release(id, lease),
        settle: async (id, usage) => {
          const settled = await budget.settle(id, usage)
          settlementConfirmed = settled === true && usage !== null
          return settled
        },
      },
      fetch: (url, init) => {
        failureEvent = 'provider_failed'
        // Keep the final synchronous dispatch fence adjacent to the native call;
        // logging happens only after invoking it, never between fence and fetch.
        const pending = (deps.fetch ?? globalThis.fetch)(url, init)
        diagnostic('provider_request_started')
        return pending
      }, now, timeoutMs: Math.max(1, deadline - now()), maxOutputTokens: 1024,
    })
    const raw = await processor(readSnapshot(frozen), controller.signal)
    live()
    if (!settlementConfirmed) { diagnostic('settlement_unconfirmed'); return localOnly() }
    failureEvent = 'assessment_invalid'
    const report = validateAssessment(frozen, raw)
    live()
    diagnostic('scored')
    return { ...localOnly(), employer_screening: report }
  }
  try {
    const expired = new Promise<InlineScreeningFields>(resolve => {
      timer = setTimeout(() => { diagnostic('deadline_expired'); controller.abort(); resolve(localOnly()) }, Math.max(0, deadline - now()))
    })
    let workResult: InlineScreeningFields | undefined
    const result = await Promise.race([work().then(value => { workResult = value; return value }), expired])
    // A result the work already produced is returned as-is; the deadline only
    // decides outcomes the work did not finish, never swaps a finished one out.
    return workResult ?? (controller.signal.aborted || now() >= deadline ? localOnly() : result)
  } catch (error) {
    // A v2 failure names its stage or validation rule; the deadline still
    // wins, because an abort mid generation is a deadline, not a defect.
    if (controller.signal.aborted || now() >= deadline) diagnostic('deadline_expired')
    else if (currentFailureEvent() === 'review_v2_failed') diagnostic(reviewV2FailureEvent(error))
    else diagnostic(currentFailureEvent())
    return localOnly()
  }
  finally { if (timer) clearTimeout(timer); controller.abort() }
}

export function inlineScreeningDependencies(db: SupabaseClient): InlineScreeningDependencies {
  return {
    loadJob: async (jobId, signal) => {
      const { data, error } = await db.from('job_listings').select('id, company_id, title, description, status')
        .eq('id', jobId).abortSignal(signal).single()
      if (error) throw new Error('Inline job criteria unavailable')
      return data
    },
    budget: options => new SupabaseInlineScreeningBudgetStore(db, options),
    reviewBudget: options => new SupabaseSolReviewBudgetStore(db, options),
  }
}
