import { z } from 'zod'
import { VerificationFileError, buildCleanPdf, deleteDocuments, storeDocument } from '@/lib/verification/files'
import { seekerView } from '@/lib/verification/seeker'
import {
  loadVerifications, logVerificationEvent, sameOrigin, uploadsOpen, verificationEnabled, verificationJson, verificationLimit,
  verificationNotFound, verificationSeeker, verificationUploadsReady, type VerificationRow,
} from '@/lib/verification/server'
import { CONSENT_VERSION, VERIFICATION_FILES_PER_DOCUMENT, antiguaToday, badgeIsValid, daysBetween, isRtwGroup } from '@/lib/verification/shared'

export const maxDuration = 60

// Hosting caps a request body at 4.5 MB.
const REQUEST_LIMIT = 4 * 1024 * 1024
/** A badge can be renewed once it is within this many days of ending. */
const RENEWAL_WINDOW_DAYS = 30

async function readForm(request: Request): Promise<FormData> {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new VerificationFileError('Use the upload form.')
  const tooLarge = new VerificationFileError('These files are too large to send together. Up to 4 MB in total.')
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

/**
 * Upload the right-to-work document and send it for review, in one step.
 * The id is "new" to start a check, or an existing check that needs the
 * document again. Free; only once uploads have been opened.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verificationEnabled()) return verificationNotFound()
  if (!sameOrigin(request)) return verificationJson({ error: 'Invalid request.' }, 400)
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const { id } = await params
  if (id !== 'new' && !z.uuid().safeParse(id).success) return verificationNotFound()
  const limited = await verificationLimit('upload', seeker.user.id)
  if (limited) return limited

  const { db, user, profile } = seeker
  let stored: string | null = null
  try {
    if (!verificationUploadsReady() || !(await uploadsOpen(db))) {
      return verificationJson({ error: 'Verification is opening soon. Check back shortly.', code: 'UPLOADS_LOCKED' }, 409)
    }
    // The reviewer matches the document against this name.
    if (!profile.first_name?.trim() || !profile.last_name?.trim()) {
      return verificationJson({ error: 'Add your first and last name to your profile first, exactly as they appear on your document.', code: 'NAME_REQUIRED' }, 409)
    }

    const form = await readForm(request)
    // Consent is its own tick box, required on every upload.
    if (form.get('consent') !== 'yes' || form.get('consent_version') !== CONSENT_VERSION) {
      return verificationJson({ error: 'Tick the consent box before uploading.', code: 'CONSENT_REQUIRED' }, 400)
    }
    const files = form.getAll('files').filter((item): item is File => item instanceof File)
    if (files.length < 1 || files.length > VERIFICATION_FILES_PER_DOCUMENT) {
      return verificationJson({ error: `Choose 1 to ${VERIFICATION_FILES_PER_DOCUMENT} files.` }, 400)
    }

    const current = await loadVerifications(db, user.id)
    let row: VerificationRow
    if (id === 'new') {
      const group = form.get('group')
      if (!isRtwGroup(group)) return verificationJson({ error: 'Choose how you are allowed to work in Antigua and Barbuda.' }, 400)
      if (current.open) return verificationJson({ error: 'Your document is already with us.', code: 'IN_PROGRESS' }, 409)
      if (badgeIsValid(current.badge) && daysBetween(antiguaToday(), current.badge!.verified_until!) > RENEWAL_WINDOW_DAYS) {
        return verificationJson({ error: 'You are already verified. You can renew in the last 30 days before your badge ends.', code: 'ALREADY_VERIFIED' }, 409)
      }
      const created = await db.from('seeker_verifications')
        .insert({ seeker_id: profile.id, user_id: user.id, rtw_group_claimed: group }).select('*').single()
      if (created.error) {
        if (created.error.code === '23505') return verificationJson({ error: 'Your document is already with us.', code: 'IN_PROGRESS' }, 409)
        throw new Error('create failed')
      }
      row = created.data as VerificationRow
    } else {
      if (!current.open || current.open.id !== id) return verificationNotFound()
      if (current.open.status !== 'reupload_needed' && current.open.status !== 'draft') {
        return verificationJson({ error: 'Your document is already with us.', code: 'IN_PROGRESS' }, 409)
      }
      row = current.open
    }

    const clean = await buildCleanPdf(await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer()))))
    const document = await storeDocument(db, row.id, 'rtw', clean)
    stored = document.path
    const now = new Date().toISOString()
    const saved = await db.from('seeker_verifications').update({
      status: 'submitted', rtw_file_path: document.path, rtw_file_sha256: document.sha256, key_version: document.keyVersion,
      consent_at: now, consent_version: CONSENT_VERSION, submitted_at: now, decision_reason: null,
    }).eq('id', row.id).eq('user_id', user.id).in('status', ['draft', 'reupload_needed']).select('*').maybeSingle()
    if (saved.error || !saved.data) throw new Error('save failed')
    stored = null
    await logVerificationEvent(db, { verification_id: row.id, actor_id: user.id, actor_role: 'seeker', event: 'uploaded' })
    return verificationJson({ verification: seekerView(saved.data as VerificationRow) })
  } catch (error) {
    // A file that was stored but never recorded must not be left behind.
    if (stored) await deleteDocuments(db, [stored]).catch(() => console.error('[verification-upload] Orphan file left for the daily sweep'))
    if (error instanceof VerificationFileError) return verificationJson({ error: error.message, code: 'FILE_REFUSED' }, 400)
    console.error('[verification-upload] Failed')
    return verificationJson({ error: 'We could not save that. Check your connection and try again.' }, 503)
  }
}
