import { documentHeaders } from '@/lib/verification/files'
import { buildRtwConfirmation } from '@/lib/verification/stamp'
import { loadVerifications, verificationEnabled, verificationLimit, verificationNotFound, verificationSeeker } from '@/lib/verification/server'
import { badgeIsValid, isRtwDocumentType, isRtwGroup } from '@/lib/verification/shared'

/** The confirmation exactly as an employer would see it, for the owner of a valid badge. */
export async function GET() {
  if (!verificationEnabled()) return verificationNotFound()
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const limited = await verificationLimit('document', seeker.user.id)
  if (limited) return limited
  try {
    const { badge } = await loadVerifications(seeker.db, seeker.user.id)
    if (!badge || !badgeIsValid(badge) || !badge.reviewed_at || !isRtwGroup(badge.rtw_group) || !isRtwDocumentType(badge.rtw_document_type)) {
      return verificationNotFound()
    }
    const pdf = await buildRtwConfirmation({
      verifiedOn: badge.reviewed_at, sharedWith: null, sharedOn: new Date().toISOString(),
      name: [seeker.profile.first_name, seeker.profile.last_name].filter(Boolean).join(' '),
      group: badge.rtw_group, documentType: badge.rtw_document_type,
      verifiedUntil: badge.verified_until!, confirmationCode: badge.confirmation_code!,
    })
    return new Response(new Uint8Array(pdf), { headers: documentHeaders('right-to-work-confirmation.pdf') })
  } catch {
    return Response.json({ error: 'Document unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
