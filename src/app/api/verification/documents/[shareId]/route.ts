import { z } from 'zod'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { documentHeaders, readDocument } from '@/lib/verification/files'
import { buildRtwConfirmation, stampPoliceRecord } from '@/lib/verification/stamp'
import { logVerificationEvent, verificationEnabled, verificationLimit, verificationNotFound, type VerificationRow } from '@/lib/verification/server'
import { badgeIsValid, isRtwDocumentType, isRtwGroup } from '@/lib/verification/shared'

export const maxDuration = 30

type Nested<T> = T | T[] | null
const first = <T,>(value: Nested<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value)

/**
 * Streams one stamped document to the employer it was shared with, and logs
 * the view.
 *
 * Only the employer who owns the job the person applied to, only while
 * sharing is on and the badge is valid. Every other case is the same 404:
 * the response never reveals whether a share exists.
 */
export async function GET(request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  if (!verificationEnabled()) return verificationNotFound()
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  const { shareId } = await params
  const kind = new URL(request.url).searchParams.get('document')
  if (!z.uuid().safeParse(shareId).success || (kind !== 'rtw' && kind !== 'police_record')) return verificationNotFound()
  const limited = await verificationLimit('document', auth.user.id)
  if (limited) return limited

  try {
    const db = createAdminClient()
    const found = await db.from('verification_shares')
      .select('id, share_police_record, share_rtw, shared_at, revoked_at, seeker_verifications(*), applications(seeker_profiles(first_name, last_name), job_listings(companies(id, user_id, company_name)))')
      .eq('id', shareId).maybeSingle()
    if (found.error) throw new Error('load failed')
    const share = found.data
    if (!share || share.revoked_at) return verificationNotFound()

    const application = first(share.applications as Nested<{
      seeker_profiles: Nested<{ first_name: string | null; last_name: string | null }>
      job_listings: Nested<{ companies: Nested<{ id: string; user_id: string; company_name: string }> }>
    }>)
    const company = first(first(application?.job_listings ?? null)?.companies ?? null)
    if (!company || company.user_id !== auth.user.id) return verificationNotFound()
    if (kind === 'police_record' ? !share.share_police_record : !share.share_rtw) return verificationNotFound()

    const verification = first(share.seeker_verifications as Nested<VerificationRow>)
    if (!verification || !badgeIsValid(verification) || !verification.reviewed_at) return verificationNotFound()

    const stamp = { verifiedOn: verification.reviewed_at, sharedWith: company.company_name, sharedOn: share.shared_at }
    let pdf: Buffer
    if (kind === 'rtw') {
      if (!isRtwGroup(verification.rtw_group) || !isRtwDocumentType(verification.rtw_document_type)) return verificationNotFound()
      const profile = first(application?.seeker_profiles ?? null)
      pdf = await buildRtwConfirmation({
        ...stamp, name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' '),
        group: verification.rtw_group, documentType: verification.rtw_document_type,
        verifiedUntil: verification.verified_until!, confirmationCode: verification.confirmation_code!,
      })
    } else {
      if (!verification.police_record_file_path) return verificationNotFound()
      const clean = await readDocument(db, verification.id, 'police_record', verification.police_record_file_path, verification.police_record_sha256)
      pdf = await stampPoliceRecord(clean, stamp)
    }

    // Logged before the bytes leave: no view without its record.
    const viewed = await db.from('verification_views')
      .insert({ share_id: share.id, viewer_id: auth.user.id, company_id: company.id, document: kind })
    if (viewed.error) throw new Error('view log failed')
    await logVerificationEvent(db, { verification_id: verification.id, actor_id: auth.user.id, actor_role: 'employer', event: 'file_opened_by_employer', document: kind })

    return new Response(new Uint8Array(pdf), { headers: documentHeaders(kind === 'rtw' ? 'right-to-work-confirmation.pdf' : 'police-record.pdf') })
  } catch {
    console.error('[verification-document] Failed')
    return Response.json({ error: 'Document unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
