import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { validBadge, verificationEnabled } from './server'
import { antiguaToday, longDate, type BadgeInfo } from './shared'

export interface ShareChoice { police_record: boolean; right_to_work: boolean }

/** Reads the two ticks from the apply request. Anything but a literal true is a no. */
export function parseShareChoice(input: unknown): ShareChoice | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  const choice = { police_record: value.police_record === true, right_to_work: value.right_to_work === true }
  return choice.police_record || choice.right_to_work ? choice : null
}

/**
 * Record which documents this application carries. The tick box on the apply
 * form is the consent for this share, so nothing is recorded without it, and
 * only ever from the applicant's own valid verification (the database checks
 * that again). Returns false, never throws: sharing must not block applying.
 */
export async function recordShare(db: SupabaseClient, applicationId: string, seekerId: string, choice: ShareChoice | null): Promise<boolean> {
  if (!verificationEnabled() || !choice) return false
  try {
    const badge = await validBadge(db, seekerId)
    if (!badge) return false
    const { error } = await db.from('verification_shares').insert({
      application_id: applicationId, verification_id: badge.id,
      share_police_record: choice.police_record, share_rtw: choice.right_to_work,
    })
    if (error) { console.error('[verification-share] Share not recorded'); return false }
    return true
  } catch {
    console.error('[verification-share] Share unavailable')
    return false
  }
}

/** The one line an employer's new-applicant email gains when documents were shared. */
export async function sharedEmailLine(db: SupabaseClient, applicationId: string): Promise<string | null> {
  if (!verificationEnabled()) return null
  try {
    const { data } = await db.from('verification_shares')
      .select('share_police_record, share_rtw, revoked_at, seeker_verifications(status, verified_until, reviewed_at)')
      .eq('application_id', applicationId).maybeSingle()
    const verification = Array.isArray(data?.seeker_verifications) ? data?.seeker_verifications[0] : data?.seeker_verifications
    if (!data || data.revoked_at || !verification?.reviewed_at || verification.status !== 'approved' || verification.verified_until < antiguaToday()) return null
    const what = data.share_police_record && data.share_rtw ? 'police record and right to work'
      : data.share_police_record ? 'police record' : 'right to work'
    return `This applicant is JobLink Verified: ${what} checked ${longDate(verification.reviewed_at)}.`
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

export interface ApplicationShare { shareId: string; policeRecord: boolean; rightToWork: boolean }

/** Live shares for a set of applications: sharing still on and the badge still valid. */
export async function sharesForApplications(db: SupabaseClient, applicationIds: string[]): Promise<Map<string, ApplicationShare>> {
  const shares = new Map<string, ApplicationShare>()
  if (!verificationEnabled() || !applicationIds.length) return shares
  const { data, error } = await db.from('verification_shares')
    .select('id, application_id, share_police_record, share_rtw, seeker_verifications(status, verified_until)')
    .in('application_id', applicationIds.slice(0, 1000)).is('revoked_at', null)
  if (error) return shares
  const today = antiguaToday()
  for (const row of data ?? []) {
    const verification = Array.isArray(row.seeker_verifications) ? row.seeker_verifications[0] : row.seeker_verifications
    if (verification?.status !== 'approved' || !verification.verified_until || verification.verified_until < today) continue
    shares.set(row.application_id, { shareId: row.id, policeRecord: row.share_police_record, rightToWork: row.share_rtw })
  }
  return shares
}
