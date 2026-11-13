import { endBadge, loadShares, seekerView } from '@/lib/verification/seeker'
import {
  loadVerifications, sameOrigin, uploadsOpen, verificationCheckoutEnabled, verificationEnabled,
  verificationJson, verificationLimit, verificationNotFound, verificationSeeker,
} from '@/lib/verification/server'

/** The job seeker's current verification, shares and views. */
export async function GET() {
  if (!verificationEnabled()) return verificationNotFound()
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const limited = await verificationLimit('read', seeker.user.id)
  if (limited) return limited
  try {
    const [current, open] = await Promise.all([loadVerifications(seeker.db, seeker.user.id), uploadsOpen(seeker.db)])
    const shares = current.badge ? await loadShares(seeker.db, current.badge.id) : []
    return verificationJson({
      checkoutEnabled: verificationCheckoutEnabled(),
      uploadsOpen: open,
      open: seekerView(current.open),
      badge: seekerView(current.badge),
      last: seekerView(current.last),
      shares,
      name: [seeker.profile.first_name, seeker.profile.last_name].filter(Boolean).join(' '),
    })
  } catch {
    return verificationJson({ error: 'Could not load your verification. Try again.' }, 503)
  }
}

/** Delete my documents: removes the stored police record and ends the badge. */
export async function DELETE(request: Request) {
  if (!verificationEnabled()) return verificationNotFound()
  if (!sameOrigin(request)) return verificationJson({ error: 'Invalid request.' }, 400)
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const limited = await verificationLimit('manage', seeker.user.id)
  if (limited) return limited
  try {
    const { badge } = await loadVerifications(seeker.db, seeker.user.id)
    if (!badge) return verificationNotFound()
    await endBadge(seeker.db, badge, 'withdrawn', { id: seeker.user.id, role: 'seeker' })
    return verificationJson({ success: true })
  } catch {
    return verificationJson({ error: 'We could not delete your documents. Nothing was changed. Try again.' }, 503)
  }
}
