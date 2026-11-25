import { z } from 'zod'
import { uploadsOpen, validBadge, verificationEnabled, verificationJson, verificationLimit, verificationNotFound, verificationSeeker, verificationUploadsReady } from '@/lib/verification/server'

/** What the apply form needs: whether this job seeker can send a confirmation, and whether to mention Verified. */
export async function GET(request: Request) {
  if (!verificationEnabled()) return verificationNotFound()
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const jobId = new URL(request.url).searchParams.get('job_id')
  if (!z.uuid().safeParse(jobId).success) return verificationNotFound()
  const limited = await verificationLimit('read', seeker.user.id)
  if (limited) return limited
  try {
    const [badge, applications, open] = await Promise.all([
      validBadge(seeker.db, seeker.profile.id),
      seeker.db.from('applications').select('id', { count: 'exact', head: true }).eq('seeker_id', seeker.profile.id),
      uploadsOpen(seeker.db),
    ])
    return verificationJson({
      verified: !!badge,
      holdsWorkPermit: badge?.rtw_group === 'work_permit',
      priorApplications: applications.count ?? 0,
      canGetVerified: open && verificationUploadsReady(),
    })
  } catch {
    return verificationJson({ error: 'Unavailable' }, 503)
  }
}
