import { createAdminClient } from '../supabase/admin'
import { PDF_EXTRACTION_LIMITS } from '../employer-screening/pdf-extraction'
import { parseSeekerCv, type CvSource, type CvResult, type CvParseStatus, type DownloadCv } from './parser'

export const CV_BATCH_SIZE = 10
export interface CvBackfillStore {
  pending(): Promise<CvSource[]>
  download: DownloadCv
  save(source: CvSource, result: CvResult): Promise<boolean>
  remaining(): Promise<number>
}

export async function runCvBatch(store: CvBackfillStore) {
  const counts: Record<CvParseStatus, number> = { parsed: 0, no_cv: 0, unreadable: 0, empty: 0, pending: 0 }
  let skipped = 0
  for (const profile of (await store.pending()).slice(0, CV_BATCH_SIZE)) {
    if (profile.cv_parse_status !== 'pending') { skipped++; continue }
    // Sequential extraction is below the shared extractor's concurrency limit of 2.
    const result = await parseSeekerCv(profile, store.download)
    if (await store.save(profile, result)) counts[result.cv_parse_status]++
    else skipped++ // CV/profile changed while downloading or a competing call finished.
  }
  const remaining = await store.remaining()
  return { counts, skipped, remaining, done: remaining === 0 }
}

export function cvBackfillStore(admin = createAdminClient()): CvBackfillStore {
  return {
    async pending() {
      const { data, error } = await admin.from('seeker_profiles')
        .select('id,user_id,cv_url,updated_at,cv_parse_status,cv_parsed_at')
        .eq('cv_parse_status', 'pending').order('id').limit(CV_BATCH_SIZE)
      if (error) throw new Error('CV queue unavailable')
      return (data ?? []) as CvSource[]
    },
    async download(path) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const { data, error } = await admin.storage.from('cvs')
          .download(path, {}, { signal: controller.signal }).asStream()
        if (error) {
          if (('statusCode' in error && String(error.statusCode) === '404') ||
              ('code' in error && error.code === 'NoSuchKey')) return null
          throw new Error('CV storage unavailable')
        }
        if (!data) return null
        const reader = data.getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > PDF_EXTRACTION_LIMITS.bytes) {
              await reader.cancel()
              return null
            }
            chunks.push(value)
          }
        } finally { reader.releaseLock() }
        return new Uint8Array(Buffer.concat(chunks, size))
      } finally { clearTimeout(timer) }
    },
    async save(source, result) {
      let query = admin.from('seeker_profiles').update(result)
        .eq('id', source.id).eq('cv_parse_status', 'pending').eq('updated_at', source.updated_at)
      query = source.cv_url === null ? query.is('cv_url', null) : query.eq('cv_url', source.cv_url)
      const { data, error } = await query.select('id')
      if (error) throw new Error('CV result unavailable')
      return Boolean(data?.length)
    },
    async remaining() {
      const { count, error } = await admin.from('seeker_profiles')
        .select('id', { count: 'exact', head: true }).eq('cv_parse_status', 'pending')
      if (error) throw new Error('CV queue unavailable')
      return count ?? 0
    },
  }
}

// Coalesce overlapping calls in this process. Cross-process writes use the source
// comparison above; PDF workers independently enforce their shared capacity gate.
let running: ReturnType<typeof runCvBatch> | undefined
export function runSeekerCvBackfill() {
  if (!running) running = runCvBatch(cvBackfillStore()).finally(() => { running = undefined })
  return running
}
