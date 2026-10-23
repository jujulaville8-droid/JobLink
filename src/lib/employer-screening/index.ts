/** Pure employer-only screening and durable delivery contracts. No network or credentials. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { buildEmailHtml } from '../email-templates'
import { parseCompanyContactEmail } from '../company-contact-email'
import { validateResumeDocumentQuality, type ResumeDocumentQuality } from './quality'

/** Documentation marker only, not an executable authorization/feature gate. */
export const EMPLOYER_SCREENING_ENABLED = false
const text = z.string().trim().min(1).max(1000)
const criterion = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,60}$/), label: text,
  category: z.enum(['skill', 'relevant_experience', 'job_certification']),
  weight: z.number().int().min(1).max(100), verificationRequired: z.boolean(),
  interpretation: z.literal('ai_contextual').optional(),
  importance: z.enum(['required', 'preferred', 'duty']).optional(),
  sourceOrder: z.number().int().nonnegative().max(32000).optional(),
}).strict()
export const evidenceQualifiersSchema = z.object({
  attribution: z.enum(['applicant', 'other', 'unknown']),
  context: z.enum(['declaration', 'performed', 'training', 'requirement', 'unknown']),
  assertion: z.enum(['affirmed', 'negated', 'uncertain']),
  credentialStatus: z.enum(['not_applicable', 'claimed_attainment', 'claimed_current', 'expired', 'cancelled', 'in_progress', 'unknown']),
}).strict()
const sourceContextSchema = z.object({
  id: z.string().regex(/^context_[1-9][0-9]?$/),
  kind: z.enum(['professional_context', 'derived_attribution', 'omitted']),
  excerpt: z.string().min(1).max(400),
  location: z.string().max(80).regex(/^pdf\.page\[[1-9][0-9]{0,2}\]\.span\[(?:0|[1-9][0-9]{0,5}):[1-9][0-9]{0,5}\]$/),
}).strict()
const rubricFields = {
  versionId: text, jobId: text, criteria: z.array(criterion).min(1).max(20),
}
// Published job text is a separate provenance basis, not fabricated approval.
// Existing saved employer-approved rubrics retain their exact original shape.
const rubricSchema = z.union([
  z.object({ ...rubricFields, approved: z.literal(true) }).strict(),
  z.object({ ...rubricFields, approved: z.literal(false), source: z.literal('published_job_requirements'),
    descriptionSha256: z.string().regex(/^[a-f0-9]{64}$/),
    mappingVersion: z.string().regex(/^[a-z0-9_-]{1,100}$/), omittedContext: z.boolean(),
    jobContext: z.array(z.object({ text: z.string().min(1).max(300), sourceOrder: z.number().int().nonnegative().max(32000) }).strict()).max(8),
  }).strict(),
])
const snapshotSchema = z.object({
  applicationId: text, jobId: text, companyId: text, createdAt: z.number().int().nonnegative(),
  resume: z.object({ versionId: text, sha256: z.string().regex(/^[a-f0-9]{64}$/),
    evidence: z.array(z.object({ id: text, category: criterion.shape.category,
      excerpt: text, location: text, interpretation: z.literal('ai_contextual').optional(), qualifiers: evidenceQualifiersSchema.optional() }).strict()).max(100), context: z.array(sourceContextSchema).max(20).optional(), omittedContext: z.boolean().optional() }).strict(),
  job: z.object({ title: text, versionId: text }).strict(),
  rubric: rubricSchema,
}).strict()
export type Snapshot = z.infer<typeof snapshotSchema>
export type FrozenSnapshot = Readonly<{ json: string; sha256: string }>
export type FrozenDocumentQuality = Readonly<{ json: string; sha256: string }>
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
/** Optional local document assessment is independently bound to the original CV. */
export function captureDocumentQuality(input: unknown, expectedSourceSha256: string): FrozenDocumentQuality {
  const json = JSON.stringify(validateResumeDocumentQuality(input, expectedSourceSha256))
  if (Buffer.byteLength(json, 'utf8') > 40_960) throw new Error('Document quality limit')
  return Object.freeze({ json, sha256: hash(json) })
}
export function readDocumentQuality(frozen: FrozenDocumentQuality, expectedSourceSha256: string): ResumeDocumentQuality {
  if (Buffer.byteLength(frozen.json, 'utf8') > 40_960 || hash(frozen.json) !== frozen.sha256) throw new Error('Document quality integrity failure')
  return validateResumeDocumentQuality(JSON.parse(frozen.json), expectedSourceSha256)
}
function validateSnapshot(input: unknown): Snapshot {
  const snapshot = snapshotSchema.parse(input)
  const criteria = snapshot.rubric.criteria
  if (snapshot.jobId !== snapshot.rubric.jobId || criteria.reduce((n, c) => n + c.weight, 0) !== 100 ||
      new Set(criteria.map(c => c.id)).size !== criteria.length ||
      new Set(snapshot.resume.evidence.map(e => e.id)).size !== snapshot.resume.evidence.length ||
      (snapshot.rubric.approved === false && (Math.max(...criteria.map(c => c.weight)) - Math.min(...criteria.map(c => c.weight)) > 1 ||
        criteria.some(c => c.interpretation !== 'ai_contextual' || !c.importance || c.sourceOrder === undefined))) ||
      (snapshot.rubric.approved === true && criteria.some(c => c.interpretation || c.importance || c.sourceOrder !== undefined))) {
    throw new Error('Invalid job-specific rubric or duplicate evidence')
  }
  return snapshot
}
export function captureSnapshot(input: unknown): FrozenSnapshot {
  const json = JSON.stringify(validateSnapshot(input))
  return Object.freeze({ json, sha256: hash(json) })
}
export function readSnapshot(frozen: FrozenSnapshot): Snapshot {
  if (hash(frozen.json) !== frozen.sha256) throw new Error('Snapshot integrity failure')
  return validateSnapshot(JSON.parse(frozen.json))
}
const assessmentSchema = z.array(z.object({
  criterionId: text, finding: z.enum(['supported', 'contradicted', 'unknown']),
  evidenceIds: z.array(text).max(10),
}).strict()).max(20)
export type Assessment = z.infer<typeof assessmentSchema>
export type Report = { status: 'unavailable' } | {
  status: 'scored'; rubricVersion: string; supportedPoints: number; unresolvedPoints: number;
  evidenceCoverage: number;
  criteriaSource?: 'published_job_requirements'; weighting?: 'equal'; jobContextOmitted?: boolean;
  criteria: { label: string; weight: number; finding: 'supported' | 'contradicted' | 'unknown';
    verificationRequired: boolean; evidence: { excerpt: string; location: string }[] }[];
}
/** Score calculation is deterministic; the processor never supplies a numeric score. */
export function validateAssessment(frozen: FrozenSnapshot, raw: unknown): Report {
  const s = readSnapshot(frozen), findings = assessmentSchema.parse(raw)
  if (findings.length !== s.rubric.criteria.length || new Set(findings.map(f => f.criterionId)).size !== findings.length ||
      findings.some(f => !s.rubric.criteria.some(c => c.id === f.criterionId))) throw new Error('Incomplete rubric assessment')
  const criteria = s.rubric.criteria.map(c => {
    const f = findings.find(f => f.criterionId === c.id)!
    if ((f.finding === 'unknown') !== (f.evidenceIds.length === 0) || new Set(f.evidenceIds).size !== f.evidenceIds.length) throw new Error('Evidence required for established findings')
    const evidence = f.evidenceIds.map(id => {
      const e = s.resume.evidence.find(e => e.id === id &&
        (e.category === c.category || (s.rubric.approved === false && c.interpretation === 'ai_contextual')))
      if (!e) throw new Error('Unknown or unrelated evidence source')
      return { excerpt: e.excerpt, location: e.location }
    })
    return { label: c.label, weight: c.weight, finding: f.finding, verificationRequired: c.verificationRequired, evidence }
  })
  const supportedPoints = criteria.reduce((n, c) => n + (c.finding === 'supported' ? c.weight : 0), 0)
  const unresolvedPoints = criteria.reduce((n, c) => n + (c.finding === 'unknown' ? c.weight : 0), 0)
  return { status: 'scored', rubricVersion: s.rubric.versionId, supportedPoints, unresolvedPoints,
    evidenceCoverage: 100 - unresolvedPoints, criteria,
    ...(s.rubric.approved === false ? { criteriaSource: 'published_job_requirements' as const, weighting: 'equal' as const, jobContextOmitted: s.rubric.omittedContext } : {}) }
}
export type Processor = (snapshot: Snapshot, signal: AbortSignal) => Promise<unknown>
/** Intentionally has no provider integration, credentials, network, or fallback model. */
export const unconfiguredProcessor: Processor = async () => { throw new Error('Processor not configured') }
export async function screen(frozen: FrozenSnapshot, processor: Processor, now: () => number = Date.now,
  budgetMs = 60_000, deadlineMs = 120_000): Promise<Report> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const snapshot = readSnapshot(frozen)
    const startedAt = now()
    const cutoff = Math.min(startedAt + budgetMs, snapshot.createdAt + deadlineMs)
    const remaining = cutoff - startedAt
    if (!Number.isFinite(remaining) || remaining <= 0) return { status: 'unavailable' }
    const raw = await Promise.race([
      Promise.resolve().then(() => processor(snapshot, controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Deadline')) }, remaining) }),
    ])
    if (now() >= cutoff) return { status: 'unavailable' }
    return validateAssessment(frozen, raw)
  } catch { return { status: 'unavailable' } }
  finally { if (timer) clearTimeout(timer); controller.abort() }
}

const attachmentSchema = z.object({
  storagePath: z.string().min(1).max(1024).refine(p => !p.includes('..') && !p.includes('://') && !p.startsWith('/')),
  filename: z.string().min(1).max(255).refine(p => !/[\\/\r\n]/.test(p)),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive().max(10 * 1024 * 1024),
}).strict()
const mailboxSchema = z.string().refine(value => {
  const parsed = parseCompanyContactEmail(value)
  return parsed.valid && parsed.email !== null && parsed.email === value
}, 'Invalid canonical mailbox')
const emailSchema = z.object({
  // Existing live sender is an exact allowlisted display-name form. No arbitrary headers.
  from: z.union([z.literal('JobLink <notifications@joblinkantigua.com>'), mailboxSchema]),
  to: mailboxSchema, replyTo: mailboxSchema.nullable().optional().transform(value => value ?? null),
  subject: z.string().min(1).max(1000).refine(s => !/[\r\n]/.test(s)),
  html: z.string().min(1).max(1_000_000), resumeVersionId: text.nullable(),
  resumeSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), attachments: z.array(attachmentSchema).max(1),
}).strict()
export type AttachmentDescriptor = Readonly<z.infer<typeof attachmentSchema>>
export type EmailContent = z.input<typeof emailSchema>
export type FrozenEmail = Readonly<Omit<z.output<typeof emailSchema>, 'attachments'> & {
  attachments: readonly AttachmentDescriptor[]; payloadSha256: string;
}>
/** Descriptors refer only to immutable private captures, never mutable profile URLs.
 * No profile URL or mutable sender configuration may substitute for this payload. */
export function captureEmail(input: EmailContent): FrozenEmail {
  const content = emailSchema.parse(input)
  if (content.attachments.length === 0) {
    if (content.resumeVersionId !== null || content.resumeSha256 !== null) throw new Error('Absent attachment requires null résumé metadata')
  } else if (content.resumeVersionId === null || content.attachments[0].sha256 !== content.resumeSha256) {
    throw new Error('Attachment résumé digest mismatch')
  }
  const payloadSha256 = hash(JSON.stringify(content))
  return Object.freeze({ ...content, attachments: Object.freeze(content.attachments.map(a => Object.freeze(a))), payloadSha256 })
}
export function readEmail(input: FrozenEmail): FrozenEmail {
  const { payloadSha256, ...content } = input
  const frozen = captureEmail({ ...content, attachments: [...content.attachments] })
  if (payloadSha256 !== frozen.payloadSha256) throw new Error('Email integrity failure')
  return frozen
}
/** Verify the exact immutable captured bytes before allowing a future transport to send. */
export function verifyAttachmentBytes(descriptor: AttachmentDescriptor, bytes: Uint8Array): void {
  attachmentSchema.parse(descriptor)
  if (bytes.byteLength !== descriptor.bytes || createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256) {
    throw new Error('Attachment integrity failure')
  }
}
/** This envelope is captured independently from AI input, from authenticated DB joins.
 * Missing/corrupt/unapproved screening must never remove the ordinary application. */
const baselineSchema = z.object({
  applicationId: text, jobId: text, companyId: text, createdAt: z.number().int().nonnegative(),
  from: emailSchema.shape.from, to: mailboxSchema, replyTo: mailboxSchema.nullable(),
  applicantName: z.string().min(1).max(200), applicantEmail: mailboxSchema.nullable(),
  applicantPhone: z.string().max(80).nullable(), jobTitle: text, companyName: text,
  coverLetterExcerpt: z.string().max(1500),
  reviewPath: z.string().regex(/^\/my-listings\/[a-zA-Z0-9_-]+\/applicants$/).nullable(),
  resumeVersionId: text.nullable(), resumeSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  attachments: z.array(attachmentSchema).max(1),
}).strict()
export type Baseline = z.infer<typeof baselineSchema>
export type FrozenBaseline = Readonly<{ json: string; sha256: string }>
function validateBaseline(input: unknown): Baseline {
  const baseline = baselineSchema.parse(input)
  // Reuse the exact nullable attachment consistency contract, without composing text.
  captureEmail({ ...baselineFields(baseline), subject: 'Application', html: '<p>Application</p>' })
  return baseline
}
function baselineFields(b: Baseline) {
  return { from: b.from, to: b.to, replyTo: b.replyTo, resumeVersionId: b.resumeVersionId,
    resumeSha256: b.resumeSha256, attachments: b.attachments }
}
export function captureBaseline(input: unknown): FrozenBaseline {
  const json = JSON.stringify(validateBaseline(input))
  return Object.freeze({ json, sha256: hash(json) })
}
export function readBaseline(frozen: FrozenBaseline): Baseline {
  if (hash(frozen.json) !== frozen.sha256) throw new Error('Baseline integrity failure')
  return validateBaseline(JSON.parse(frozen.json))
}
/** Uses only the independently captured envelope, never a mutable profile or model text. */
export function composeBaseline(baseline: Baseline, report: Report, quality?: ResumeDocumentQuality): FrozenEmail {
  const b = validateBaseline(baseline)
  const rendered = buildEmailHtml('new_applicant', {
    applicant_name: b.applicantName, applicant_email: b.applicantEmail, applicant_phone: b.applicantPhone,
    job_title: b.jobTitle, company_name: b.companyName, cover_letter_excerpt: b.coverLetterExcerpt,
    cv_attached: b.attachments.length > 0, review_path: b.reviewPath, employer_screening: report,
    employer_resume_quality: quality && b.resumeSha256 ? validateResumeDocumentQuality(quality, b.resumeSha256) : { status: 'unavailable' },
  })
  // Subject is a header, not HTML; strip all control characters from user-supplied titles.
  return captureEmail({ ...baselineFields(b), ...rendered,
    subject: `${b.applicantName} just applied for ${b.jobTitle}`.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 1000) })
}
function verifyBaselineEmail(baseline: Baseline, email: FrozenEmail): FrozenEmail {
  const verified = readEmail(email)
  const expected = captureEmail({ ...baselineFields(baseline), subject: verified.subject, html: verified.html })
  if (expected.payloadSha256 !== verified.payloadSha256) throw new Error('Email does not match trusted baseline')
  return verified
}
export const SEND_WINDOW_MS = 23 * 60 * 60 * 1000
export type QueueItem = { id: string; baseline: FrozenBaseline; snapshot?: FrozenSnapshot; quality?: FrozenDocumentQuality; email?: FrozenEmail; attempts: number; firstSendAt?: number }
/** Durable atomic transactions/CAS fence stale workers; the DB clock is authoritative. */
export interface OutboxStore {
  claim(now: number): Promise<{ item: QueueItem; lease: string } | null>
  freeze(id: string, lease: string, email: FrozenEmail): Promise<boolean>
  startSend(id: string, lease: string, payloadSha256: string, now: number): Promise<boolean>
  finish(id: string, lease: string, outcome: SendOutcome, retryAt: number | null): Promise<boolean>
}
export type SendOutcome = { kind: 'accepted'; providerId: string } | { kind: 'not_sent' } | { kind: 'uncertain' }
  | { kind: 'rejected' } | { kind: 'rate_limited'; retryAfterMs: number }
  | { kind: 'concurrent_conflict' } | { kind: 'payload_conflict' }
export type Transport = (email: FrozenEmail, idempotencyKey: string, signal?: AbortSignal) => Promise<SendOutcome>
/** Never infer non-acceptance from a timeout, exception, 5xx or in-flight conflict. */
export function nextSendRetry(outcome: SendOutcome, attempts: number, firstSendAt: number, now: number): number | null {
  if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts >= 3 || !Number.isSafeInteger(now) || !Number.isSafeInteger(firstSendAt) || firstSendAt < 0 || now < firstSendAt) return null
  if (outcome.kind !== 'not_sent' && outcome.kind !== 'rate_limited') return null
  const delay = outcome.kind === 'rate_limited' ? outcome.retryAfterMs : 30_000 * 2 ** attempts
  if (!Number.isFinite(delay) || delay < 0) return null
  const retryAt = now + Math.max(30_000, delay)
  return retryAt < firstSendAt + SEND_WINDOW_MS ? retryAt : null
}
export type ProcessOptions = {
  processorFactory?: (item: QueueItem, lease: string) => Processor
  screeningBudgetMs?: number
  transportTimeoutMs?: number
}
/** One original forwarding operation. Scoring failures preserve a valid baseline.
 * Storage/DB authority failures never justify bypassing the queue or direct sending.
 * A provider/network outage can prevent delivery; the deadline bounds scoring delay,
 * not recipient inbox delivery. A separately configured watchdog provides liveness. */
export async function processNext(store: OutboxStore, processor: Processor,
  compose: (baseline: Baseline, report: Report, quality?: ResumeDocumentQuality) => FrozenEmail, transport: Transport,
  now: () => number = Date.now, options: ProcessOptions = {}): Promise<boolean> {
  const claimed = await store.claim(now())
  if (!claimed) return false
  const { item, lease } = claimed
  if (!Number.isSafeInteger(item.attempts) || item.attempts < 0 ||
      (item.attempts > 0 && item.firstSendAt === undefined) ||
      (item.firstSendAt !== undefined && (!Number.isSafeInteger(item.firstSendAt) || item.firstSendAt < 0))) {
    throw new Error('Invalid persisted send history; reconciliation required')
  }
  const baseline = readBaseline(item.baseline)
  const applicationId = baseline.applicationId
  let email = item.email
  if (!email) {
    let report: Report = { status: 'unavailable' }
    let quality: ResumeDocumentQuality | undefined
    try {
      if (item.quality && baseline.resumeSha256 && baseline.attachments.length === 1) {
        quality = readDocumentQuality(item.quality, baseline.resumeSha256)
      }
    } catch { /* Optional quality corruption never suppresses the trusted baseline. */ }
    try {
      if (item.snapshot) {
        const snapshot = readSnapshot(item.snapshot)
        if (snapshot.applicationId === applicationId && snapshot.jobId === baseline.jobId &&
            snapshot.companyId === baseline.companyId && snapshot.createdAt === baseline.createdAt &&
            snapshot.resume.versionId === baseline.resumeVersionId && snapshot.resume.sha256 === baseline.resumeSha256 &&
            baseline.attachments.length === 1) {
          const configured = options.processorFactory?.(item, lease) ?? processor
          report = await screen(item.snapshot, configured, now, Math.min(options.screeningBudgetMs ?? 60_000, 60_000), 95_000)
        }
      }
    } catch { /* Invalid screening/provenance/configuration is unavailable, not a lost application. */ }
    try { email = verifyBaselineEmail(baseline, compose(structuredClone(baseline), report, quality ? structuredClone(quality) : undefined)) }
    catch { email = composeBaseline(baseline, { status: 'unavailable' }, quality) }
    if (!await store.freeze(item.id, lease, email)) return false
  }
  // A persisted payload can never be replaced on retry, even when corrupt.
  email = verifyBaselineEmail(baseline, email)
  const startedAt = now()
  if (!await store.startSend(item.id, lease, email.payloadSha256, startedAt)) return false
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancellationTimer: ReturnType<typeof setTimeout> | undefined
  let outcome: SendOutcome
  try {
    outcome = await Promise.race([
      Promise.resolve().then(() => transport(email!, `application/${applicationId}/employer`, controller.signal)),
      new Promise<SendOutcome>(resolve => {
        timer = setTimeout(() => {
          controller.abort()
          // Give the outcome-aware transport a bounded opportunity to report
          // provable non-dispatch (for example an aborted attachment read).
          // An uncooperative transport still becomes uncertain, never retried.
          cancellationTimer = setTimeout(() => resolve({ kind: 'uncertain' }), 25)
        },
          Math.min(Math.max(options.transportTimeoutMs ?? 20_000, 1), 30_000))
      }),
    ])
  } catch { outcome = { kind: 'uncertain' } }
  finally { if (timer) clearTimeout(timer); if (cancellationTimer) clearTimeout(cancellationTimer); controller.abort() }
  const retryAt = nextSendRetry(outcome, item.attempts, item.firstSendAt ?? startedAt, now())
  return store.finish(item.id, lease, outcome, retryAt)
}
