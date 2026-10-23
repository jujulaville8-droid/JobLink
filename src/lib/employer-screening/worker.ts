import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { composeBaseline, processNext, unconfiguredProcessor, type OutboxStore, type ProcessOptions, type Transport } from './index'
import { SupabaseOutboxStore } from './supabase-outbox-store'
import { createOpenAIProcessor, SupabaseScreeningBudgetStore } from './provider'
import { createResendTransport } from './transport'
import { MAX_CAPTURE_BYTES, SCREENING_CAPTURE_BUCKET } from './capture'

/** Separate drain gate: turning NEW application screening off must not strand old
 * outbox-selected applications or reroute them through the legacy sender. */
export function employerOutboxWorkerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return ['EMPLOYER_OUTBOX_WORKER_ENABLED', 'EMPLOYER_SCREENING_SCHEMA_READY',
    'EMPLOYER_SCREENING_DELIVERY_APPROVED'].every(key => env[key] === 'true')
}
export type WorkerSummary = { disabled: boolean; processed: number; failed: number; quarantined: number }
export async function drainEmployerOutbox(deps: {
  store: OutboxStore & { watchdog(): Promise<number> }; transport: Transport;
  processorFactory?: ProcessOptions['processorFactory']; now?: () => number;
  maxItems?: number; maxDurationMs?: number;
}): Promise<WorkerSummary> {
  const now = deps.now ?? Date.now, started = now()
  const limit = Math.min(Math.max(deps.maxItems ?? 10, 1), 20)
  const duration = Math.min(Math.max(deps.maxDurationMs ?? 90_000, 1), 120_000)
  const result: WorkerSummary = { disabled: false, processed: 0, failed: 0, quarantined: await deps.store.watchdog() }
  for (let i = 0; i < limit && now() - started < duration; i++) {
    try {
      const didWork = await processNext(deps.store, unconfiguredProcessor, composeBaseline, deps.transport, now, {
        processorFactory: deps.processorFactory,
        // Reserve time for delivery and persistence within this invocation.
        screeningBudgetMs: Math.max(0, Math.min(60_000, duration - (now() - started) - 25_000)),
        transportTimeoutMs: 20_000,
      })
      if (!didWork) break
      result.processed++
    } catch { result.failed++ /* No private details in logs or HTTP output. */ }
  }
  return result
}
/** No clients, storage reads, or network calls until independently default-OFF gates pass. */
export async function runEmployerScreeningWorker(): Promise<WorkerSummary> {
  const deliveryEnabled = employerOutboxWorkerEnabled() && !!process.env.RESEND_API_KEY
  const cleanupEnabled = process.env.EMPLOYER_SCREENING_CAPTURE_CLEANUP_ENABLED === 'true' && process.env.EMPLOYER_SCREENING_SCHEMA_READY === 'true'
  if (!deliveryEnabled && !cleanupEnabled) {
    return { disabled: true, processed: 0, failed: 0, quarantined: 0 }
  }
  const db = createAdminClient()
  const store = new SupabaseOutboxStore(db)
  const budget = new SupabaseScreeningBudgetStore(db)
  const transport = createResendTransport({ enabled: true, apiKey: process.env.RESEND_API_KEY,
    async readAttachment(descriptor, signal) {
      if (signal.aborted) throw new Error('Capture unavailable')
      const { data: bucket, error: bucketError } = await db.storage.getBucket(SCREENING_CAPTURE_BUCKET)
      if (bucketError || !bucket || bucket.public !== false || signal.aborted) throw new Error('Capture unavailable')
      const { data, error } = await db.storage.from(SCREENING_CAPTURE_BUCKET).download(descriptor.storagePath)
      if (error || !data || signal.aborted || data.size > MAX_CAPTURE_BYTES || data.size !== descriptor.bytes) throw new Error('Capture unavailable')
      return new Uint8Array(await data.arrayBuffer())
    },
  })
  const summary: WorkerSummary = deliveryEnabled ? await drainEmployerOutbox({ store, transport,
    processorFactory: (_item, lease) => createOpenAIProcessor({
      enabled: ['EMPLOYER_SCREENING_ENABLED', 'EMPLOYER_SCREENING_PRIVACY_APPROVED', 'EMPLOYER_SCREENING_CONTEXT_PRIVACY_APPROVED',
        'EMPLOYER_SCREENING_BUDGET_APPROVED', 'EMPLOYER_SCREENING_PAID_PROVIDER_ENABLED'].every(key => process.env[key] === 'true'),
      lease, configId: process.env.EMPLOYER_SCREENING_BUDGET_CONFIG_ID ?? '',
      apiKey: process.env.OPENAI_API_KEY, budget,
    }),
  }) : { disabled: false, processed: 0, failed: 0, quarantined: 0 }
  if (cleanupEnabled) {
    try {
      const { data: bucket, error } = await db.storage.getBucket(SCREENING_CAPTURE_BUCKET)
      if (!error && bucket?.public === false) await drainCaptureCleanup(store, async path => {
        const { error: removalError } = await db.storage.from(SCREENING_CAPTURE_BUCKET).remove([path])
        return !removalError
      })
    } catch { summary.failed++ }
  }
  return summary
}
/** Cleanup uses leased exact paths, never bucket enumeration or a guessed prefix.
 * Uncertain removes are safe to repeat because each object name is immutable and
 * the SQL claim/apply locks exclude live application references. */
export async function drainCaptureCleanup(store: Pick<SupabaseOutboxStore, 'claimCleanup' | 'finishCleanup'>,
  remove: (path: string) => Promise<boolean>): Promise<number> {
  let count = 0
  for (let i = 0; i < 10; i++) {
    const item = await store.claimCleanup()
    if (!item) break
    let deleted = false
    try { deleted = await remove(item.storagePath) } catch { /* Retry through durable cleanup lease. */ }
    if (await store.finishCleanup(item.id, item.lease, deleted) && deleted) count++
  }
  return count
}
