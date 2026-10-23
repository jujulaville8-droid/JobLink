/** Server-side capture only. No provider/email calls; extracted evidence is locally minimized. */
import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CvFull } from '@/lib/types'
import { resumeSections } from '@/lib/resume-document'
import { resumeFilename } from '@/lib/resume-filename'
import { applicantCvPath } from '@/lib/applicant-notifications'
import { captureDocumentQuality, verifyAttachmentBytes, type AttachmentDescriptor, type Snapshot, type FrozenDocumentQuality } from './index'
import { validateMinimizedExtraction } from './privacy'
import { assessResumeDocumentQuality } from './quality'
import { boundedBuilderSnapshot, BUILDER_CAPTURE_LIMITS } from './builder-render'
import { createBoundedCaptureReadClient, type CaptureReadOptions } from './capture-read'

export const SCREENING_CAPTURE_BUCKET = 'employer-screening-captures'
export const MAX_CAPTURE_BYTES = 5 * 1024 * 1024
export const CAPTURE_BUDGET_MS = 5_000
export type CapturedResume = Readonly<{
  versionId: string; sha256: string; attachment: AttachmentDescriptor;
  extraction: { sourceSha256: string; evidence: Snapshot['resume']['evidence']; context?: Snapshot['resume']['context']; omittedContext?: boolean } | null;
  quality?: FrozenDocumentQuality;
}>
export type ResumeSource = { first_name: string | null; last_name: string | null; cv_url: unknown }
export interface CaptureDependencies {
  readSource(userId: string, options: CaptureReadOptions): Promise<ResumeSource | null>
  download(path: string, options: CaptureReadOptions): Promise<Uint8Array>
  loadBuilder(userId: string, options: { signal: AbortSignal; deadline: number }): Promise<CvFull | null>
  renderBuilder(cv: CvFull, options: { signal: AbortSignal; budgetMs: number }): Promise<Uint8Array>
  /** Must create in a private bucket with upsert:false; never overwrite. */
  write(path: string, bytes: Uint8Array, signal?: AbortSignal, deadline?: number): Promise<void>
  extractPdf?(bytes: Uint8Array, options: { signal: AbortSignal; budgetMs: number; trustedBuilderMetadata?: { sourceSha256: string; lines: readonly string[] } }): Promise<(NonNullable<CapturedResume['extraction']> & { localPages?: readonly string[] }) | null>
  uuid?: () => string
}
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const isPdf = (bytes: Uint8Array) => bytes.byteLength > 5 && bytes.byteLength <= MAX_CAPTURE_BYTES &&
  Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-'

/** Captures before application insertion. A timeout never delays baseline enqueue.
 * Late work may leave an unreferenced private object, but can never change an application.
 * No mutable source is ever read by the delivery worker. */
export async function captureApplicationResume(applicationId: string, userId: string,
  deps: CaptureDependencies, budgetMs = CAPTURE_BUDGET_MS): Promise<CapturedResume | null> {
  z.uuid().parse(applicationId); z.uuid().parse(userId)
  if (!Number.isSafeInteger(budgetMs) || budgetMs <= 0 || budgetMs > CAPTURE_BUDGET_MS) return null
  let expired = false
  const controller = new AbortController()
  const deadline = Date.now() + budgetMs
  let timer: ReturnType<typeof setTimeout> | undefined
  const withinBudget = () => {
    if (expired || Date.now() >= deadline) { expired = true; controller.abort(); return false }
    return true
  }
  const capture = async (): Promise<CapturedResume | null> => {
    const source = await deps.readSource(userId, { signal: controller.signal, deadline })
    if (!source || !withinBudget()) return null
    let bytes: Uint8Array
    let builderMetadata: string[] | undefined
    if (source.cv_url) {
      const path = applicantCvPath(source.cv_url, userId)
      if (!path) return null // Never substitute a different source for an invalid uploaded CV.
      const downloaded = await deps.download(path, { signal: controller.signal, deadline })
      if (!withinBudget() || !isPdf(downloaded)) return null
      bytes = Uint8Array.from(downloaded)
    } else {
      const sourceCv = await deps.loadBuilder(userId, { signal: controller.signal, deadline })
      if (!sourceCv || !withinBudget()) return null
      // Validate workload before cloning/rendering. A single detached input drives
      // both the isolated renderer and structured evidence; nothing is truncated.
      const cv = boundedBuilderSnapshot(sourceCv)
      if (cv.profile.user_id !== userId || !withinBudget()) return null
      // Only typed inert metadata from the exact detached render input. Never
      // descriptions, credential names/status/dates, free-text arrays or request hints.
      builderMetadata = resumeSections(cv).filter(section => ['experiences', 'projects', 'certifications'].includes(section.key))
        .flatMap(section => section.entries.map(entry => entry.subtitle ?? '')).filter(Boolean)
      const rendered = await deps.renderBuilder(cv, { signal: controller.signal,
        budgetMs: Math.max(1, Math.min(BUILDER_CAPTURE_LIMITS.renderBudgetMs, deadline - Date.now())) })
      if (!withinBudget() || !isPdf(rendered)) return null
      bytes = Uint8Array.from(rendered)
    }
    if (!withinBudget() || !isPdf(bytes)) return null
    const digest = sha256(bytes)
    const versionId = z.uuid().parse((deps.uuid ?? randomUUID)())
    const attachment: AttachmentDescriptor = Object.freeze({
      storagePath: `${userId}/${applicationId}/${versionId}.pdf`, filename: resumeFilename(source.first_name, source.last_name),
      sha256: digest, bytes: bytes.byteLength,
    })
    let extraction: CapturedResume['extraction'] = null
    let quality: FrozenDocumentQuality | undefined
    try {
      // Parse the original bytes for both uploads and builder PDFs. Raw decoded
      // pages are transient local input to quality only, never stored or sent to AI.
      if (deps.extractPdf && Date.now() < deadline) {
        const parsed = await deps.extractPdf(Uint8Array.from(bytes), {
          signal: controller.signal, budgetMs: Math.max(1, Math.min(3_000, deadline - Date.now())),
          ...(builderMetadata ? { trustedBuilderMetadata: { sourceSha256: digest, lines: builderMetadata } } : {}),
        })
        if (!withinBudget()) return null
        if (parsed) {
          extraction = validateMinimizedExtraction({ sourceSha256: parsed.sourceSha256, evidence: parsed.evidence, ...(parsed.context ? { context: parsed.context } : {}),
            ...(parsed.omittedContext !== undefined ? { omittedContext: parsed.omittedContext } : {}) }, digest)
          if (parsed.localPages) {
            const assessed = assessResumeDocumentQuality({ sourceSha256: parsed.sourceSha256, localPages: parsed.localPages }, digest)
            if (assessed.status === 'assessed') quality = captureDocumentQuality(assessed, digest)
          }
        }
      }
      // No context-free fallback after parser failure or omission. Builder skills
      // may be qualified elsewhere in the same source; baseline delivery survives.
    } catch { /* Uncertain/unsafe evidence means unavailable, never 0 or raw-text fallback. */ }
    if (!withinBudget()) return null
    await deps.write(attachment.storagePath, Uint8Array.from(bytes), controller.signal, deadline)
    if (!withinBudget()) return null
    // A storage adapter cannot change the original bytes used for evidence binding.
    verifyAttachmentBytes(attachment, bytes)
    if (extraction) {
      extraction.evidence.forEach(evidence => Object.freeze(evidence))
      Object.freeze(extraction.evidence); Object.freeze(extraction)
    }
    return Object.freeze({ versionId, sha256: digest, attachment, extraction, ...(quality ? { quality } : {}) })
  }
  try {
    const timeout = new Promise<null>(resolve => {
      timer = setTimeout(() => { expired = true; controller.abort(); resolve(null) }, Math.max(1, deadline - Date.now()))
    })
    return await Promise.race([timeout, Promise.resolve().then(capture)])
  } catch { return null }
  finally { expired = true; controller.abort(); if (timer) clearTimeout(timer) }
}

/** All reads are scoped to the verified applicant; only private immutable objects are written. */
export function captureDependencies(db: SupabaseClient,
  createIoClient: (options: CaptureReadOptions) => SupabaseClient = createBoundedCaptureReadClient): CaptureDependencies {
  return {
    async readSource(userId, options) {
      const { data, error } = await createIoClient(options).from('seeker_profiles').select('first_name,last_name,cv_url').eq('user_id', userId).single()
      if (error) return null
      return data
    },
    async download(path, options) {
      const storage = createIoClient({ ...options, responseBytes: MAX_CAPTURE_BYTES, totalBytes: MAX_CAPTURE_BYTES })
      const { data, error } = await storage.storage.from('cvs').download(path)
      if (error || !data || data.size <= 0 || data.size > MAX_CAPTURE_BYTES) throw new Error('Resume unavailable')
      return new Uint8Array(await data.arrayBuffer())
    },
    async loadBuilder(userId, options) {
      const { loadBoundedBuilder } = await import('./capture-read')
      return loadBoundedBuilder(createIoClient(options), userId)
    },
    async renderBuilder(cv, options) {
      const { renderBuilderResume } = await import('./builder-render')
      const bytes = await renderBuilderResume(cv, options)
      if (!bytes) throw new Error('Builder unavailable')
      return bytes
    },
    async extractPdf(bytes, options) {
      const { extractPdfResume } = await import('./pdf-extraction')
      return extractPdfResume(bytes, options)
    },
    async write(path, bytes, signal, deadline = Date.now() + CAPTURE_BUDGET_MS) {
      const parts = path.split('/')
      if (signal?.aborted || !isPdf(bytes) || parts.length !== 3 || !parts[2].endsWith('.pdf') ||
          !z.uuid().safeParse(parts[0]).success || !z.uuid().safeParse(parts[1]).success ||
          !z.uuid().safeParse(parts[2].slice(0, -4)).success) throw new Error('Resume capture unavailable')
      const bucket = await db.storage.getBucket(SCREENING_CAPTURE_BUCKET)
      const metadata = bucket.data
      if (signal?.aborted || bucket.error || !metadata || metadata.public !== false ||
          typeof metadata.file_size_limit !== 'number' || metadata.file_size_limit > MAX_CAPTURE_BYTES ||
          metadata.file_size_limit < bytes.byteLength ||
          !Array.isArray(metadata.allowed_mime_types) || !metadata.allowed_mime_types.length ||
          metadata.allowed_mime_types.some(mime => mime !== 'application/pdf')) {
        throw new Error('Private capture storage unavailable')
      }
      // Record prospective objects BEFORE upload. A timeout, failed insert or
      // duplicate submission can therefore never create an untracked private CV.
      const registered = await db.rpc('employer_outbox_register_capture', {
        p_application_id: parts[1], p_applicant_user_id: parts[0], p_storage_path: path, p_sha256: sha256(bytes),
      })
      if (signal?.aborted || registered.error || registered.data !== true) throw new Error('Resume capture unavailable')
      // The SDK upload method has no signal option, so the capture-only client's
      // fetch links the actual request to our deadline/abort, including upload.
      const storage = createIoClient({ signal: signal ?? new AbortController().signal, deadline })
      const { error } = await storage.storage.from(SCREENING_CAPTURE_BUCKET).upload(path, bytes, {
        contentType: 'application/pdf', upsert: false, cacheControl: '0',
      })
      if (error) throw new Error('Resume capture unavailable')
    },
  }
}
