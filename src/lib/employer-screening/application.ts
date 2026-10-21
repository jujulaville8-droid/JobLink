/** Default-OFF integration. Persisted database choice, never a later runtime flag, owns delivery. */
import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureSnapshot, readBaseline, readDocumentQuality, type Snapshot, type FrozenBaseline, type FrozenSnapshot, type FrozenDocumentQuality } from './index'
import { captureApplicationResume, captureDependencies, type CapturedResume } from './capture'
import { validateMinimizedExtraction, validateScreeningCriteria } from './privacy'
import type { OutboxRpcClient } from './supabase-outbox-store'

export const SCREENING_APPLICATION_GATES = [
  'EMPLOYER_SCREENING_ENABLED', 'EMPLOYER_SCREENING_SCHEMA_READY', 'EMPLOYER_SCREENING_CAPTURE_READY',
  'EMPLOYER_SCREENING_PRIVACY_APPROVED', 'EMPLOYER_SCREENING_CONTEXT_PRIVACY_APPROVED', 'EMPLOYER_SCREENING_WORKER_READY',
  'EMPLOYER_SCREENING_DELIVERY_APPROVED', 'EMPLOYER_SCREENING_BUDGET_APPROVED',
  'EMPLOYER_SCREENING_NOTICE_APPROVED', 'NEXT_PUBLIC_EMPLOYER_SCREENING_NOTICE_ENABLED',
] as const
export function screeningApplicationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return SCREENING_APPLICATION_GATES.every(key => env[key] === 'true')
}
export function screeningRubricApprovalEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return ['EMPLOYER_SCREENING_RUBRIC_APPROVAL_ENABLED', 'EMPLOYER_SCREENING_SCHEMA_READY',
    'EMPLOYER_SCREENING_PRIVACY_APPROVED'].every(key => env[key] === 'true')
}
export class ScreeningSubmissionError extends Error {
  constructor(readonly duplicate = false) { super(duplicate ? 'Application already exists' : 'Application submission unavailable') }
}
const resultSchema = z.object({
  application: z.object({ id: z.uuid(), job_id: z.uuid(), seeker_id: z.uuid(), status: z.literal('applied') }).passthrough(),
  employer_delivery_path: z.enum(['legacy', 'screening']),
  baseline_json: z.string().nullable(), baseline_sha256: z.string().nullable(),
  rubric_json: z.unknown().nullable(), rubric_version_id: z.string().nullable(),
})
export type ScreeningApplicationResult = {
  application: z.infer<typeof resultSchema>['application']; deliveryPath: 'legacy' | 'screening';
}
export interface ApplicationDependencies {
  db: OutboxRpcClient
  capture(applicationId: string, userId: string): Promise<CapturedResume | null>
  uuid?: () => string
}

/** Called only after route verifies current user, seeker, and visible job. The RPC
 * rechecks those identities, atomically inserts/queues, and pins the approved rubric.
 * An uncertain RPC result NEVER falls through to legacy insert or notification. */
export async function submitScreeningApplication(input: {
  jobId: string; applicantUserId: string; seekerId: string; coverLetter: string;
}, deps: ApplicationDependencies): Promise<ScreeningApplicationResult> {
  const applicationId = z.uuid().parse((deps.uuid ?? randomUUID)())
  z.uuid().parse(input.jobId); z.uuid().parse(input.applicantUserId); z.uuid().parse(input.seekerId)
  const config = await deps.db.rpc('employer_screening_configuration')
  if (config.error) throw new ScreeningSubmissionError()
  const enabled = z.object({ enabled: z.boolean() }).parse(config.data).enabled
  let captured: CapturedResume | null = null
  // Failure leaves a plain trusted baseline; it must not prevent insertion.
  if (enabled) { try { captured = await deps.capture(applicationId, input.applicantUserId) } catch { /* unavailable */ } }
  const response = await deps.db.rpc('employer_screening_apply', {
    p_application_id: applicationId, p_job_id: input.jobId, p_applicant_user_id: input.applicantUserId,
    p_cover_letter_text: input.coverLetter,
    p_resume_version_id: captured?.versionId ?? null, p_resume_sha256: captured?.sha256 ?? null,
    p_attachment: captured?.attachment ?? null,
  })
  if (response.error) {
    const error = response.error as { code?: unknown }
    throw new ScreeningSubmissionError(error.code === '23505')
  }
  const saved = resultSchema.parse(response.data)
  if (saved.application.id !== applicationId || saved.application.job_id !== input.jobId || saved.application.seeker_id !== input.seekerId) {
    throw new ScreeningSubmissionError()
  }
  if (saved.employer_delivery_path === 'screening') {
    // Everything below is optional enrichment of an already queued baseline.
    // A crash before finalization still makes that baseline due at its absolute deadline.
    let snapshot: FrozenSnapshot | null = null
    let quality: FrozenDocumentQuality | null = null
    try {
      if (captured && saved.baseline_json && saved.baseline_sha256) {
        const frozen: FrozenBaseline = { json: saved.baseline_json, sha256: saved.baseline_sha256 }
        const baseline = readBaseline(frozen)
        if (baseline.applicationId !== applicationId || baseline.jobId !== input.jobId ||
            baseline.resumeVersionId !== captured.versionId || baseline.resumeSha256 !== captured.sha256 ||
            baseline.attachments.length !== 1 || baseline.attachments[0].storagePath !== captured.attachment.storagePath ||
            baseline.attachments[0].filename !== captured.attachment.filename || baseline.attachments[0].sha256 !== captured.sha256 ||
            baseline.attachments[0].bytes !== captured.attachment.bytes) {
          throw new Error('Capture identity mismatch')
        }
        if (captured.quality && baseline.resumeSha256) {
          try { readDocumentQuality(captured.quality, baseline.resumeSha256); quality = captured.quality }
          catch { /* Invalid optional document quality never invalidates the CV. */ }
        }
        if (!captured.extraction || !saved.rubric_json || !saved.rubric_version_id) throw new Error('Job match unavailable')
        const rubric = (typeof saved.rubric_json === 'string' ? JSON.parse(saved.rubric_json) : saved.rubric_json) as Snapshot['rubric']
        if (rubric.versionId !== saved.rubric_version_id || rubric.jobId !== input.jobId || rubric.approved !== true) throw new Error('Rubric mismatch')
        validateScreeningCriteria(rubric.criteria)
        const extraction = validateMinimizedExtraction(captured.extraction, baseline.resumeSha256)
        if (extraction.evidence.length) snapshot = captureSnapshot({
          applicationId, jobId: input.jobId, companyId: baseline.companyId, createdAt: baseline.createdAt,
          resume: { versionId: captured.versionId, sha256: captured.sha256, evidence: extraction.evidence,
            ...(extraction.context ? { context: extraction.context } : {}),
            ...(extraction.omittedContext !== undefined ? { omittedContext: extraction.omittedContext } : {}) },
          job: { title: baseline.jobTitle, versionId: saved.rubric_version_id }, rubric,
        })
      }
    } catch { /* Unsafe/unavailable materials are explicitly finalized without a snapshot. */ }
    const registrationDeadline = Date.now() + 2_000
    const finalize = async (material: FrozenSnapshot | null): Promise<boolean> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const remaining = registrationDeadline - Date.now()
        if (remaining <= 0) return false
        const result = await Promise.race([
          deps.db.rpc('employer_screening_register_materials', {
            p_application_id: applicationId, p_applicant_user_id: input.applicantUserId,
            p_snapshot_json: material?.json ?? null, p_snapshot_sha256: material?.sha256 ?? null,
            p_quality_json: quality?.json ?? null, p_quality_sha256: quality?.sha256 ?? null,
          }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Registration timeout')), remaining) }),
        ])
        return !result.error && result.data === true
      } catch { return false }
      finally { if (timer) clearTimeout(timer) }
    }
    // DB CAS finalizes once. An unknown success cannot be overwritten by this safe
    // fallback; a failed/late CAS leaves the original baseline due at its deadline.
    if (!await finalize(snapshot) && snapshot) await finalize(null)
  }
  return { application: saved.application, deliveryPath: saved.employer_delivery_path }
}
export function applicationDependencies(db: SupabaseClient): ApplicationDependencies {
  return { db, capture: (applicationId, userId) => captureApplicationResume(applicationId, userId, captureDependencies(db)) }
}
