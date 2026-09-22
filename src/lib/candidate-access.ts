import type { SupabaseClient } from '@supabase/supabase-js'

export const DISCOVERABLE_VISIBILITIES = ['actively_looking', 'open'] as const
export function isDiscoverable(visibility: string): boolean {
  return DISCOVERABLE_VISIBILITIES.some((value) => value === visibility)
}

/** Caller identity must come from auth.getUser(), never request parameters. */
export async function canAccessCandidateCv(admin: SupabaseClient, callerId: string, targetUserId: string) {
  if (callerId === targetUserId) return true
  const { data: caller, error: callerError } = await admin.from('users')
    .select('role, is_admin').eq('id', callerId).single()
  if (callerError) throw callerError
  if (caller.is_admin || caller.role === 'admin') return true
  if (caller.role !== 'employer') return false
  const { data: company, error } = await admin.from('companies')
    .select('id, is_pro, pro_expires_at').eq('user_id', callerId).maybeSingle()
  if (error) throw error
  if (!company) return false
  const { data: profile, error: profileError } = await admin.from('seeker_profiles')
    .select('id, visibility').eq('user_id', targetUserId).maybeSingle()
  if (profileError) throw profileError
  if (!profile) return false
  const activePro = company.is_pro && (!company.pro_expires_at || new Date(company.pro_expires_at) > new Date())
  if (activePro && isDiscoverable(profile.visibility)) return true
  const { data: relationship, error: relationshipError } = await admin.from('applications')
    .select('id, job_listings!inner(company_id)').eq('seeker_id', profile.id)
    .eq('job_listings.company_id', company.id).limit(1).maybeSingle()
  if (relationshipError) throw relationshipError
  return !!relationship
}
