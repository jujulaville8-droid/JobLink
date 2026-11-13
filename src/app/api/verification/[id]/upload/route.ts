import { z } from 'zod'
import { VerificationFileError, buildCleanPdf, deleteDocuments, storeDocument } from '@/lib/verification/files'
import { fileKeyReady } from '@/lib/verification/crypto'
import { seekerView } from '@/lib/verification/seeker'
import {
  logVerificationEvent, sameOrigin, uploadsOpen, verificationEnabled, verificationJson, verificationLimit,
  verificationNotFound, verificationSeeker, type VerificationRow,
} from '@/lib/verification/server'
import { CONSENT_VERSION, VERIFICATION_FILES_PER_DOCUMENT, isRtwGroup, type VerificationDocument } from '@/lib/verification/shared'

export const maxDuration = 60

// Hosting caps a request body at 4.5 MB, so each document is sent on its own.
const REQUEST_LIMIT = 4 * 1024 * 1024

async function readForm(request: Request): Promise<FormData> {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new VerificationFileError('Use the upload form.')
  const tooLarge = new VerificationFileError('These files are too large to send together. Each document can be up to 4 MB in total.')
  if (Number(request.headers.get('content-length')) > REQUEST_LIMIT) throw tooLarge
  const reader = request.body?.getReader()
  if (!reader) throw new VerificationFileError('Choose a file to upload.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > REQUEST_LIMIT) { await reader.cancel(); throw tooLarge }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  return new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers.get('content-type')! } }).formData()
}

const columns: Record<VerificationDocument, 'rtw_file_path' | 'police_record_file_path'> = {
  rtw: 'rtw_file_path', police_record: 'police_record_file_path',
}

/**
 * Takes the consent and the documents.
 *
 *   action=document  one document (up to 3 files): checked, cleaned, encrypted, stored
 *   action=submit    both documents are in: send for review
 *
 * Only the owner, only while the check is paid or waiting for a re-upload,
 * and only once uploads have been opened.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verificationEnabled()) return verificationNotFound()
  if (!sameOrigin(request)) return verificationJson({ error: 'Invalid request.' }, 400)
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return verificationNotFound()
  const limited = await verificationLimit('upload', seeker.user.id)
  if (limited) return limited

  const { db, user } = seeker
  let stored: string | null = null
  try {
    const found = await db.from('seeker_verifications').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
    if (found.error) throw new Error('load failed')
    const row = found.data as VerificationRow | null
    if (!row) return verificationNotFound()
    if (row.status !== 'paid' && row.status !== 'reupload_needed') {
      return verificationJson({ error: 'This verification is not waiting for documents.', code: 'NOT_AWAITING_UPLOAD' }, 409)
    }
    if (!(await uploadsOpen(db)) || !fileKeyReady()) {
      return verificationJson({ error: 'Uploads are not open yet. We’ll email you when your upload is ready.', code: 'UPLOADS_LOCKED' }, 409)
    }

    const form = await readForm(request)
    // Consent is its own tick box, required on every upload request.
    if (form.get('consent') !== 'yes' || form.get('consent_version') !== CONSENT_VERSION) {
      return verificationJson({ error: 'Tick the consent box for your police record before uploading.', code: 'CONSENT_REQUIRED' }, 400)
    }
    const action = form.get('action')

    if (action === 'document') {
      const kind = form.get('document')
      if (kind !== 'rtw' && kind !== 'police_record') return verificationJson({ error: 'Choose which document this is.' }, 400)
      if (row.status === 'reupload_needed' && !row.reupload_documents.includes(kind)) {
        return verificationJson({ error: 'This document doesn’t need to be uploaded again.' }, 409)
      }
      const files = form.getAll('files').filter((item): item is File => item instanceof File)
      if (files.length < 1 || files.length > VERIFICATION_FILES_PER_DOCUMENT) {
        return verificationJson({ error: `Choose 1 to ${VERIFICATION_FILES_PER_DOCUMENT} files.` }, 400)
      }
      const clean = await buildCleanPdf(await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer()))))
      const document = await storeDocument(db, row.id, kind, clean)
      stored = document.path
      const previous = row[columns[kind]]
      const update = kind === 'rtw'
        ? { rtw_file_path: document.path }
        : { police_record_file_path: document.path, police_record_sha256: document.sha256, key_version: document.keyVersion }
      const saved = await db.from('seeker_verifications')
        .update({ ...update, consent_at: row.consent_at ?? new Date().toISOString(), consent_version: CONSENT_VERSION })
        .eq('id', row.id).eq('user_id', user.id).in('status', ['paid', 'reupload_needed']).select('*').maybeSingle()
      if (saved.error || !saved.data) throw new Error('save failed')
      stored = null
      await logVerificationEvent(db, { verification_id: row.id, actor_id: user.id, actor_role: 'seeker', event: 'uploaded', document: kind })
      // The replaced file is no longer referenced anywhere; remove it.
      if (previous) {
        try {
          await deleteDocuments(db, [previous])
          await logVerificationEvent(db, { verification_id: row.id, actor_id: user.id, actor_role: 'seeker', event: 'file_deleted', document: kind })
        } catch { console.error('[verification-upload] Replaced file not removed; the daily job will sweep it') }
      }
      return verificationJson({ verification: seekerView(saved.data as VerificationRow) })
    }

    if (action === 'submit') {
      const group = row.rtw_group_claimed ?? form.get('group')
      if (!isRtwGroup(group)) return verificationJson({ error: 'Choose how you are allowed to work in Antigua and Barbuda.' }, 400)
      if (!row.rtw_file_path || !row.police_record_file_path) {
        return verificationJson({ error: 'Upload both documents before sending them for review.' }, 400)
      }
      const saved = await db.from('seeker_verifications')
        .update({
          status: 'submitted', rtw_group_claimed: group, submitted_at: new Date().toISOString(),
          consent_at: row.consent_at ?? new Date().toISOString(), consent_version: CONSENT_VERSION,
          reupload_documents: [], decision_reason: null,
        })
        .eq('id', row.id).eq('user_id', user.id).in('status', ['paid', 'reupload_needed']).select('*').maybeSingle()
      if (saved.error || !saved.data) throw new Error('submit failed')
      return verificationJson({ verification: seekerView(saved.data as VerificationRow) })
    }

    return verificationJson({ error: 'Invalid request.' }, 400)
  } catch (error) {
    // A file that was stored but never recorded must not be left behind.
    if (stored) await deleteDocuments(db, [stored]).catch(() => console.error('[verification-upload] Orphan file left for the daily sweep'))
    if (error instanceof VerificationFileError) return verificationJson({ error: error.message, code: 'FILE_REFUSED' }, 400)
    console.error('[verification-upload] Failed')
    return verificationJson({ error: 'We could not save that. Check your connection and try again.' }, 503)
  }
}
