/** Server-only dependency-injected RPC adapter. SQL remains an UNAPPLIED review draft.
 * This module never constructs a client, reads credentials, or enables processing. */
import { z } from 'zod'
import { captureEmail, readBaseline, readDocumentQuality, readEmail, readSnapshot, type OutboxStore, type FrozenDocumentQuality, type FrozenEmail, type SendOutcome } from './index'

export interface OutboxRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const claimSchema = z.object({
  id: z.uuid(), application_id: z.uuid(), job_id: z.uuid(), company_id: z.uuid(), lease: z.uuid(),
  baseline_json: z.string(), baseline_sha256: digest,
  // Optional screening corruption must not poison the independently valid baseline.
  snapshot_json: z.unknown().optional(), snapshot_sha256: z.unknown().optional(),
  quality_json: z.unknown().optional(), quality_sha256: z.unknown().optional(),
  email_json: z.string().nullable(), payload_sha256: digest.nullable(),
  attempts: z.number().int().min(0).max(4), first_send_at: z.string().nullable(),
  processing_deadline: z.string().optional(),
})
export type ReconciliationEvidence = Readonly<{
  kind: 'accepted' | 'not_sent'; evidenceId: string; providerId?: string
}>
export class SupabaseOutboxStore implements OutboxStore {
  constructor(private readonly client: OutboxRpcClient) {}
  private async call(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.client.rpc(name, args)
    // Never expose provider/DB messages that might contain applicant information.
    if (error) throw new Error('Outbox persistence failed')
    return data
  }
  async claim(_now: number) {
    void _now // Database clock, not a caller timestamp, governs leases and dispatch.
    while (true) {
      const raw = await this.call('employer_outbox_claim')
      if (raw === null) return null
      const identity = z.object({ id: z.uuid(), lease: z.uuid() }).safeParse(raw)
      if (!identity.success) throw new Error('Invalid persisted outbox identity')
      try {
        const row = claimSchema.parse(raw)
        const baseline = { json: row.baseline_json, sha256: row.baseline_sha256 }
        const parsed = readBaseline(baseline)
        if (parsed.applicationId !== row.application_id || parsed.jobId !== row.job_id || parsed.companyId !== row.company_id) {
          throw new Error('Outbox identity mismatch')
        }
        let snapshot: { json: string; sha256: string } | undefined
        if (typeof row.snapshot_json === 'string' && typeof row.snapshot_sha256 === 'string') {
          try {
            const frozen = { json: row.snapshot_json, sha256: row.snapshot_sha256 }, s = readSnapshot(frozen)
            if (s.applicationId === parsed.applicationId && s.jobId === parsed.jobId && s.companyId === parsed.companyId &&
              s.createdAt === parsed.createdAt && s.resume.versionId === parsed.resumeVersionId && s.resume.sha256 === parsed.resumeSha256) snapshot = frozen
          } catch { /* Optional screening is unavailable; valid baseline remains deliverable. */ }
        }
        let quality: FrozenDocumentQuality | undefined
        if (parsed.resumeSha256 !== null && typeof row.quality_json === 'string' && typeof row.quality_sha256 === 'string') {
          try {
            const frozen = { json: row.quality_json, sha256: row.quality_sha256 }
            readDocumentQuality(frozen, parsed.resumeSha256)
            quality = frozen
          } catch { /* Independent optional quality cannot poison baseline delivery or valid screening. */ }
        }
        const firstSendAt = row.first_send_at === null ? undefined : Date.parse(row.first_send_at)
        if ((firstSendAt !== undefined && (!Number.isSafeInteger(firstSendAt) || firstSendAt < 0)) || (row.attempts > 0 && firstSendAt === undefined)) {
          throw new Error('Invalid persisted send history')
        }
        if ((row.email_json === null) !== (row.payload_sha256 === null)) throw new Error('Incomplete frozen email')
        // Unlike optional screening, corrupt persisted email cannot be recomposed on retry.
        const email = row.email_json === null ? undefined : readEmail({ ...JSON.parse(row.email_json), payloadSha256: row.payload_sha256 })
        if (email) {
          const expected = captureEmail({ from: parsed.from, to: parsed.to, replyTo: parsed.replyTo,
            resumeVersionId: parsed.resumeVersionId, resumeSha256: parsed.resumeSha256, attachments: parsed.attachments,
            subject: email.subject, html: email.html })
          if (expected.payloadSha256 !== email.payloadSha256) throw new Error('Persisted payload does not match baseline')
        }
        return { item: { id: row.id, baseline, snapshot, quality, email, attempts: row.attempts, firstSendAt }, lease: row.lease }
      } catch {
        // A malformed required envelope/email must not recur forever or hide later work.
        await this.call('employer_outbox_quarantine', { p_id: identity.data.id, p_lease: identity.data.lease, p_code: 'INVALID_PERSISTED_PAYLOAD' })
      }
    }
  }
  async freeze(id: string, lease: string, email: FrozenEmail): Promise<boolean> {
    const { payloadSha256, ...content } = readEmail(email)
    return z.boolean().parse(await this.call('employer_outbox_freeze', {
      p_id: id, p_lease: lease, p_content_json: JSON.stringify(content), p_digest: payloadSha256,
    }))
  }
  async startSend(id: string, lease: string, payloadSha256: string, _now: number): Promise<boolean> {
    void _now
    return z.boolean().parse(await this.call('employer_outbox_start_send', { p_id: id, p_lease: lease, p_digest: digest.parse(payloadSha256) }))
  }
  async finish(id: string, lease: string, outcome: SendOutcome, retryAt: number | null): Promise<boolean> {
    if (retryAt !== null && (!Number.isSafeInteger(retryAt) || retryAt < 0)) throw new Error('Invalid retry time')
    return z.boolean().parse(await this.call('employer_outbox_finish', {
      p_id: id, p_lease: lease, p_kind: outcome.kind,
      p_provider_id: outcome.kind === 'accepted' ? outcome.providerId : null,
      p_retry_at: retryAt === null ? null : new Date(retryAt).toISOString(),
    }))
  }
  async watchdog(): Promise<number> {
    return z.number().int().min(0).max(100).parse(await this.call('employer_outbox_watchdog'))
  }
  async registerCapture(applicationId: string, applicantUserId: string, storagePath: string, sha256: string): Promise<boolean> {
    return z.boolean().parse(await this.call('employer_outbox_register_capture', {
      p_application_id: z.uuid().parse(applicationId), p_applicant_user_id: z.uuid().parse(applicantUserId),
      p_storage_path: storagePath, p_sha256: digest.parse(sha256),
    }))
  }
  async claimCleanup(): Promise<{ id: string; applicationId: string; storagePath: string; sha256: string; lease: string } | null> {
    const raw = await this.call('employer_outbox_claim_cleanup')
    if (raw === null) return null
    const row = z.object({ id: z.uuid(), application_id: z.uuid(), storage_path: z.string().min(1).max(1024),
      sha256: digest, lease: z.uuid() }).strict().parse(raw)
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/.test(row.storage_path) || !row.storage_path.includes(`/${row.application_id}/`)) {
      throw new Error('Invalid cleanup path')
    }
    return { id: row.id, applicationId: row.application_id, storagePath: row.storage_path, sha256: row.sha256, lease: row.lease }
  }
  async finishCleanup(id: string, lease: string, deleted: boolean): Promise<boolean> {
    return z.boolean().parse(await this.call('employer_outbox_finish_cleanup', { p_id: id, p_lease: lease, p_deleted: deleted }))
  }
  /** Only invoke from a signature-verified provider webhook handler. */
  async recordReceipt(applicationId: string, payloadSha256: string, providerId: string, evidenceId: string): Promise<boolean> {
    return z.boolean().parse(await this.call('employer_outbox_record_receipt', {
      p_application_id: z.uuid().parse(applicationId), p_digest: digest.parse(payloadSha256),
      p_provider_id: z.string().min(1).max(255).parse(providerId), p_evidence_id: z.string().min(1).max(255).parse(evidenceId),
    }))
  }
  /** Caller must verify a definitive provider receipt/non-acceptance record first.
   * Missing search results, timeouts, 5xx and elapsed windows never qualify. */
  async reconcile(id: string, payloadSha256: string, evidence: ReconciliationEvidence): Promise<boolean> {
    const verified = z.object({ kind: z.enum(['accepted', 'not_sent']), evidenceId: z.string().min(1).max(255),
      providerId: z.string().min(1).max(255).optional() }).strict().parse(evidence)
    if (verified.kind === 'accepted' && !verified.providerId) throw new Error('Acceptance requires provider receipt')
    return z.boolean().parse(await this.call('employer_outbox_reconcile', {
      p_id: id, p_digest: digest.parse(payloadSha256), p_kind: verified.kind,
      p_provider_id: verified.providerId ?? null, p_evidence_id: verified.evidenceId,
    }))
  }
}
