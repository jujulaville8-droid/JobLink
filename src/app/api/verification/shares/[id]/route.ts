import { z } from 'zod'
import {
  logVerificationEvent, sameOrigin, verificationEnabled, verificationJson, verificationLimit, verificationNotFound, verificationSeeker,
} from '@/lib/verification/server'

/** Stops sharing with that employer. The application itself is untouched. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verificationEnabled()) return verificationNotFound()
  if (!sameOrigin(request)) return verificationJson({ error: 'Invalid request.' }, 400)
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return verificationNotFound()
  const limited = await verificationLimit('manage', seeker.user.id)
  if (limited) return limited
  try {
    const share = await seeker.db.from('verification_shares')
      .select('id, revoked_at, verification_id, seeker_verifications!inner(user_id)')
      .eq('id', id).eq('seeker_verifications.user_id', seeker.user.id).maybeSingle()
    if (share.error) throw new Error('load failed')
    if (!share.data) return verificationNotFound()
    if (!share.data.revoked_at) {
      const stopped = await seeker.db.from('verification_shares')
        .update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null)
      if (stopped.error) throw new Error('update failed')
      await logVerificationEvent(seeker.db, { verification_id: share.data.verification_id, actor_id: seeker.user.id, actor_role: 'seeker', event: 'sharing_stopped' })
    }
    return verificationJson({ success: true })
  } catch {
    return verificationJson({ error: 'We could not stop sharing. Try again.' }, 503)
  }
}
