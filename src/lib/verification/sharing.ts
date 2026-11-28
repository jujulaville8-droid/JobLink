import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { validBadge, verificationEnabled } from './server'
import { BADGE_ELIGIBLE, BADGE_PERMIT, antiguaToday, longDate, type BadgeInfo } from './shared'

/**
 * Record that this application carries the right-to-work confirmation. The tick
 * box on the apply form is the consent for this share, so nothing is recorded
 * without it, and only from the applicant's own valid verification (the
 * database checks that again). Returns false, never throws: sharing must not
 * block applying.
 */
export async function recordShare(db: SupabaseClient, applicationId: string, seekerId: string, send: boolean): Promise<boolean> {
  if (!verificationEnabled() || !send) return false
  try {
    const badge = await validBadge(db, seekerId)
    if (!badge) return false
    const { error } = await db.from('verification_shares').insert({ application_id: applicationId, verification_id: badge.id })
    if (error) { console.error('[verification-share] Share not recorded'); return false }
    return true
  } catch {
    console.error('[verification-share] Share unavailable')
    return false
  }
}

/** The one line an employer's new-applicant email gains when the confirmation was shared. */
export async function sharedEmailLine(db: SupabaseClient, applicationId: string): Promise<string | null> {
  if (!verificationEnabled()) return null
  try {
    const { data } = await db.from('verification_shares')
      .select('revoked_at, seeker_verifications(status, verified_until, reviewed_at, rtw_group)')
      .eq('application_id', applicationId).maybeSingle()
    const verification = Array.isArray(data?.seeker_verifications) ? data?.seeker_verifications[0] : data?.seeker_verifications
    if (!data || data.revoked_at || !verification?.reviewed_at || verification.status !== 'approved' || verification.verified_until < antiguaToday()) return null
    return `${verification.rtw_group === 'work_permit' ? BADGE_PERMIT : BADGE_ELIGIBLE} (checked by JobLink ${longDate(verification.reviewed_at)}).`
  } catch {
    return null
  }
}

/** Valid badges for a set of profiles. Empty when Verified is off. */
export async function badgesFor(db: SupabaseClient, seekerIds: string[]): Promise<Map<string, BadgeInfo>> {
  const badges = new Map<string, BadgeInfo>()
  const ids = [...new Set(seekerIds)].slice(0, 500)
  if (!verificationEnabled() || !ids.length) return badges
  const { data, error } = await db.rpc('verified_badges', { p_seeker_ids: ids })
  if (error) return badges
  for (const row of (data ?? []) as { seeker_id: string; holds_work_permit: boolean; checked_on: string }[]) {
    badges.set(row.seeker_id, { holdsWorkPermit: row.holds_work_permit, checkedOn: row.checked_on })
  }
  return badges
}

/** Live shares for a set of applications: sharing still on and the badge still valid. */
export async function sharesForApplications(db: SupabaseClient, applicationIds: string[]): Promise<Map<string, string>> {
  const shares = new Map<string, string>()
  if (!verificationEnabled() || !applicationIds.length) return shares
  const { data, error } = await db.from('verification_shares')
    .select('id, application_id, seeker_verifications(status, verified_until)')
    .in('application_id', applicationIds.slice(0, 1000)).is('revoked_at', null)
  if (error) return shares
  const today = antiguaToday()
  for (const row of data ?? []) {
    const verification = Array.isArray(row.seeker_verifications) ? row.seeker_verifications[0] : row.seeker_verifications
    if (verification?.status !== 'approved' || !verification.verified_until || verification.verified_until < today) continue
    shares.set(row.application_id, row.id)
  }
  return shares
}
