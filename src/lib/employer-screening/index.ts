/** Offline foundation only. No database, storage, email, or AI client imports. */
import { createHash } from 'node:crypto'
import { z } from 'zod'

/** Documentation marker only, not an executable authorization/feature gate. */
export const EMPLOYER_SCREENING_ENABLED = false
const text = z.string().trim().min(1).max(1000)
const criterion = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,60}$/), label: text,
  category: z.enum(['skill', 'relevant_experience', 'job_certification']),
  weight: z.number().int().min(1).max(100), verificationRequired: z.boolean(),
}).strict()
const snapshotSchema = z.object({
  applicationId: text, jobId: text, companyId: text, createdAt: z.number().int().nonnegative(),
  resume: z.object({ versionId: text, sha256: z.string().regex(/^[a-f0-9]{64}$/),
    evidence: z.array(z.object({ id: text, category: criterion.shape.category,
      excerpt: text, location: text }).strict()).max(100) }).strict(),
  job: z.object({ title: text, versionId: text }).strict(),
  rubric: z.object({ versionId: text, jobId: text, approved: z.literal(true),
    criteria: z.array(criterion).min(1).max(20) }).strict(),
}).strict()
export type Snapshot = z.infer<typeof snapshotSchema>
export type FrozenSnapshot = Readonly<{ json: string; sha256: string }>
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function validateSnapshot(input: unknown): Snapshot {
  const snapshot = snapshotSchema.parse(input)
  const criteria = snapshot.rubric.criteria
  if (snapshot.jobId !== snapshot.rubric.jobId || criteria.reduce((n, c) => n + c.weight, 0) !== 100 ||
      new Set(criteria.map(c => c.id)).size !== criteria.length ||
      new Set(snapshot.resume.evidence.map(e => e.id)).size !== snapshot.resume.evidence.length) {
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
      const e = s.resume.evidence.find(e => e.id === id && e.category === c.category)
      if (!e) throw new Error('Unknown or unrelated evidence source')
      return { excerpt: e.excerpt, location: e.location }
    })
    return { label: c.label, weight: c.weight, finding: f.finding, verificationRequired: c.verificationRequired, evidence }
  })
  const supportedPoints = criteria.reduce((n, c) => n + (c.finding === 'supported' ? c.weight : 0), 0)
  const unresolvedPoints = criteria.reduce((n, c) => n + (c.finding === 'unknown' ? c.weight : 0), 0)
  return { status: 'scored', rubricVersion: s.rubric.versionId, supportedPoints, unresolvedPoints,
    evidenceCoverage: 100 - unresolvedPoints, criteria }
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

export type FrozenEmail = Readonly<{ to: string; subject: string; html: string; resumeVersionId: string; resumeSha256: string }>
export type QueueItem = { id: string; snapshot: FrozenSnapshot; email?: FrozenEmail; attempts: number }
/** Implement with durable atomic transactions/CAS before wiring to apply. Lease tokens fence stale workers. */
export interface OutboxStore {
  claim(now: number): Promise<{ item: QueueItem; lease: string } | null>
  freeze(id: string, lease: string, email: FrozenEmail): Promise<boolean>
  startSend(id: string, lease: string): Promise<boolean>
  finish(id: string, lease: string, outcome: SendOutcome, retryAt: number | null): Promise<void>
}
export type SendOutcome = { kind: 'accepted'; providerId: string } | { kind: 'not_sent' } | { kind: 'uncertain' }
export type Transport = (email: FrozenEmail, idempotencyKey: string) => Promise<SendOutcome>
/** One forwarding operation only; never sends a later score email or alters applicant status. */
export async function processNext(store: OutboxStore, processor: Processor, compose: (snapshot: Snapshot, report: Report) => FrozenEmail,
  transport: Transport, now: () => number = Date.now): Promise<boolean> {
  const claimed = await store.claim(now())
  if (!claimed) return false
  const { item, lease } = claimed
  // Integrity/composition/persistence failures deliberately stop here. A production adapter
  // needs a separately trusted baseline forwarding envelope and recovery states; see docs.
  const snapshot = readSnapshot(item.snapshot)
  // Keep trusted identities independent of the injected composer’s mutable argument.
  const applicationId = snapshot.applicationId
  const { versionId: resumeVersionId, sha256: resumeSha256 } = snapshot.resume
  const validateEmail = (email: FrozenEmail) => {
    if (email.resumeVersionId !== resumeVersionId || email.resumeSha256 !== resumeSha256) {
      throw new Error('Email résumé does not match application snapshot')
    }
  }
  let email = item.email
  if (!email) {
    const report = await screen(item.snapshot, processor, now)
    email = Object.freeze(compose(snapshot, report))
    validateEmail(email)
    if (!await store.freeze(item.id, lease, email)) return false
  }
  validateEmail(email)
  if (!await store.startSend(item.id, lease)) return false
  let outcome: SendOutcome
  try { outcome = await transport(email, `application/${applicationId}/employer`) }
  catch { outcome = { kind: 'uncertain' } }
  // Uncertain acceptance NEVER retries automatically. A crash after startSend also needs reconciliation.
  const retryAt = outcome.kind === 'not_sent' && item.attempts < 3 ? now() + 30_000 * 2 ** item.attempts : null
  await store.finish(item.id, lease, outcome, retryAt)
  return true
}
