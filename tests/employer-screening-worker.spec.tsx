import { afterEach, describe, expect, it, vi } from 'vitest'
const service = vi.hoisted(() => ({ rpc: vi.fn(), getBucket: vi.fn(), createAdminClient: vi.fn() }))
vi.mock('../src/lib/supabase/admin', () => ({ createAdminClient: service.createAdminClient }))
import { employerOutboxWorkerEnabled, runEmployerScreeningWorker, drainEmployerOutbox } from '../src/lib/employer-screening/worker'
import { captureBaseline, type QueueItem, type OutboxStore, type FrozenEmail, type SendOutcome } from '../src/lib/employer-screening'
import { createResendTransport } from '../src/lib/employer-screening/transport'
const baseline = () => captureBaseline({ applicationId: 'application-1', jobId: 'job-1', companyId: 'company-1', createdAt: Date.now(),
  from: 'JobLink <notifications@joblinkantigua.com>', to: 'employer@example.test', replyTo: null,
  applicantName: 'Synthetic Applicant', applicantEmail: null, applicantPhone: null, jobTitle: 'Office Assistant',
  companyName: 'Synthetic Employer', coverLetterExcerpt: '', reviewPath: null,
  resumeVersionId: null, resumeSha256: null, attachments: [],
})
class Store implements OutboxStore {
  state = 'pending'; email?: FrozenEmail; outcome?: SendOutcome; retryAt?: number | null; item: QueueItem = { id: 'queue-1', baseline: baseline(), attempts: 0 }
  watchdog = vi.fn(async () => 0)
  async claim() { if (this.state !== 'pending') return null; this.state = 'claimed'; return { item: this.item, lease: 'lease-1' } }
  async freeze(_id: string, _lease: string, email: FrozenEmail) { this.email = email; return true }
  async startSend() { this.state = 'sending'; return true }
  async finish(_id: string, _lease: string, outcome: SendOutcome, retryAt: number | null) { this.outcome = outcome; this.retryAt = retryAt; this.state = outcome.kind; return true }
}
describe('default-OFF drain and watchdog', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
  it('does not infer worker enablement from new application scoring flags', () => {
    expect(employerOutboxWorkerEnabled({ EMPLOYER_SCREENING_ENABLED: 'true' })).toBe(false)
    expect(employerOutboxWorkerEnabled({ EMPLOYER_SCREENING_ENABLED: 'false', EMPLOYER_OUTBOX_WORKER_ENABLED: 'true', EMPLOYER_SCREENING_SCHEMA_READY: 'true', EMPLOYER_SCREENING_DELIVERY_APPROVED: 'true' })).toBe(true)
  })
  it('returns disabled without connecting any service under default environment', async () => {
    expect(await runEmployerScreeningWorker()).toEqual({ disabled: true, processed: 0, failed: 0, quarantined: 0 })
    expect(service.createAdminClient).not.toHaveBeenCalled()
  })
  it('runs separately authorized private cleanup without delivery credentials or enablement', async () => {
    vi.stubEnv('EMPLOYER_OUTBOX_WORKER_ENABLED', 'false')
    vi.stubEnv('EMPLOYER_SCREENING_SCHEMA_READY', 'true')
    vi.stubEnv('EMPLOYER_SCREENING_CAPTURE_CLEANUP_ENABLED', 'true')
    vi.stubEnv('RESEND_API_KEY', '')
    service.rpc.mockResolvedValue({ data: null, error: null })
    service.getBucket.mockResolvedValue({ data: { public: false }, error: null })
    service.createAdminClient.mockReturnValue({ rpc: service.rpc, storage: { getBucket: service.getBucket } })
    expect(await runEmployerScreeningWorker()).toEqual({ disabled: false, processed: 0, failed: 0, quarantined: 0 })
    expect(service.rpc).toHaveBeenCalledExactlyOnceWith('employer_outbox_claim_cleanup', undefined)
  })
  it('forwards a no-snapshot baseline and drains once, with watchdog before sending', async () => {
    const store = new Store(), send = vi.fn(async (): Promise<SendOutcome> => ({ kind: 'accepted', providerId: 'synthetic' }))
    const result = await drainEmployerOutbox({ store, transport: send })
    expect(result).toEqual({ disabled: false, processed: 1, failed: 0, quarantined: 0 })
    expect(store.watchdog).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledOnce()
    expect(store.email?.html).toContain('No score was assigned')
    expect(store.email?.html).toContain('A CV attachment is unavailable')
  })
  it('bounds a hung transport and leaves uncertainty rather than blindly retrying', async () => {
    const { processNext, composeBaseline, unconfiguredProcessor } = await import('../src/lib/employer-screening')
    const store = new Store(), send = vi.fn(() => new Promise<SendOutcome>(() => {}))
    expect(await processNext(store, unconfiguredProcessor, composeBaseline, send, Date.now, { transportTimeoutMs: 5 })).toBe(true)
    expect(store.outcome).toEqual({ kind: 'uncertain' })
    expect(await processNext(store, unconfiguredProcessor, composeBaseline, send)).toBe(false)
    expect(send).toHaveBeenCalledOnce()
  })
  it('keeps a timed-out attachment read retryable when transport proves no dispatch', async () => {
    const { processNext, composeBaseline, readBaseline, unconfiguredProcessor } = await import('../src/lib/employer-screening')
    const store = new Store(), original = readBaseline(store.item.baseline)
    store.item.baseline = captureBaseline({ ...original, resumeVersionId: 'capture-v1', resumeSha256: 'a'.repeat(64),
      attachments: [{ storagePath: 'private/application/capture-v1.pdf', filename: 'resume.pdf', sha256: 'a'.repeat(64), bytes: 123 }] })
    const fetch = vi.fn()
    const transport = createResendTransport({ enabled: true, apiKey: 'synthetic-only', fetch,
      readAttachment: () => new Promise<Uint8Array>(() => {}) })
    await processNext(store, unconfiguredProcessor, composeBaseline, transport, Date.now, { transportTimeoutMs: 5 })
    expect(fetch).not.toHaveBeenCalled()
    expect(store.outcome).toEqual({ kind: 'not_sent' })
    expect(store.retryAt).toBeTypeOf('number')
  })
})
