import { z } from 'zod'
import {
  validBadge, verificationCheckoutEnabled, verificationEnabled, verificationJson, verificationLimit,
  verificationNotFound, verificationSeeker,
} from '@/lib/verification/server'

/**
 * What the apply form needs to show the Verified ticks or the one-line prompt:
 * whether this job seeker holds a valid badge, whether the job is marked
 * "Police record required", and whether this is their first application.
 */
export async function GET(request: Request) {
  if (!verificationEnabled()) return verificationNotFound()
  const seeker = await verificationSeeker()
  if ('error' in seeker) return seeker.error
  const jobId = new URL(request.url).searchParams.get('job_id')
  if (!z.uuid().safeParse(jobId).success) return verificationNotFound()
  const limited = await verificationLimit('read', seeker.user.id)
  if (limited) return limited
  try {
    const [badge, job, applications] = await Promise.all([
      validBadge(seeker.db, seeker.profile.id),
      seeker.db.from('job_listings').select('police_record_required').eq('id', jobId).eq('status', 'active').maybeSingle(),
      seeker.db.from('applications').select('id', { count: 'exact', head: true }).eq('seeker_id', seeker.profile.id),
    ])
    return verificationJson({
      verified: !!badge,
      // The reviewer asked for a notice to be read before sharing.
      notice: badge?.sharing_notice === true,
      holdsWorkPermit: badge?.rtw_group === 'work_permit',
      policeRecordRequired: job.data?.police_record_required === true,
      priorApplications: applications.count ?? 0,
      canBuy: verificationCheckoutEnabled(),
    })
  } catch {
    return verificationJson({ error: 'Unavailable' }, 503)
  }
}
