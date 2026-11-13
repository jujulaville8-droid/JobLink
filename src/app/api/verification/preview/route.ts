import { documentHeaders, readDocument } from '@/lib/verification/files'
import { buildRtwConfirmation, stampPoliceRecord } from '@/lib/verification/stamp'
import {
  loadVerifications, logVerificationEvent, verificationEnabled, verificationLimit, verificationNotFound, verificationSeeker,
} from '@/lib/verification/server'
import { badgeIsValid, isRtwDocumentType, isRtwGroup } from '@/lib/verification/shared'

export const maxDuration = 30

/** The stamped copy exactly as an employer would see it, for the owner of a valid badge. */
export async function GET(request: Request) {
  if (!verificationEnabled()) return verificationNotFound()
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const limited = await verificationLimit('document', seeker.user.id)
  if (limited) return limited
  const kind = new URL(request.url).searchParams.get('document')
  try {
    const { badge } = await loadVerifications(seeker.db, seeker.user.id)
    if (!badge || !badgeIsValid(badge) || !badge.reviewed_at) return verificationNotFound()
    const stamp = { verifiedOn: badge.reviewed_at, sharedWith: null, sharedOn: new Date().toISOString() }

    if (kind === 'rtw') {
      if (!isRtwGroup(badge.rtw_group) || !isRtwDocumentType(badge.rtw_document_type)) return verificationNotFound()
      const pdf = await buildRtwConfirmation({
        ...stamp, name: [seeker.profile.first_name, seeker.profile.last_name].filter(Boolean).join(' '),
        group: badge.rtw_group, documentType: badge.rtw_document_type,
        verifiedUntil: badge.verified_until!, confirmationCode: badge.confirmation_code!,
      })
      return new Response(new Uint8Array(pdf), { headers: documentHeaders('right-to-work-confirmation.pdf') })
    }
    if (kind === 'police_record') {
      if (!badge.police_record_file_path) return verificationNotFound()
      const clean = await readDocument(seeker.db, badge.id, 'police_record', badge.police_record_file_path, badge.police_record_sha256)
      const pdf = await stampPoliceRecord(clean, stamp)
      await logVerificationEvent(seeker.db, { verification_id: badge.id, actor_id: seeker.user.id, actor_role: 'seeker', event: 'file_opened_by_owner', document: 'police_record' })
      return new Response(new Uint8Array(pdf), { headers: documentHeaders('police-record-preview.pdf') })
    }
    return verificationNotFound()
  } catch {
    console.error('[verification-preview] Failed')
    return Response.json({ error: 'Document unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
