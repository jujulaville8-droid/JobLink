import { createClient } from '@/lib/supabase/server'
import { calculateCvCompletion } from '@/lib/cv-completion'
import type { CvFull } from '@/lib/types'

/**
 * Get or create a cv_profile for the current user.
 * Returns the cv_profile id.
 */
export async function ensureCvProfile(userId: string): Promise<string> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('cv_profiles')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('cv_profiles')
    .insert({ user_id: userId })
    .select('id')
    .single()

  if (error || !created) throw new Error('Failed to create CV profile')
  return created.id
}

/**
 * Fetch the full CV data for a user.
 */
export async function fetchFullCv(userId: string): Promise<CvFull | null> {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('cv_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!profile) return null

  const [
    { data: experiences },
    { data: education },
    { data: skills },
    { data: awards },
    { data: certifications },
  ] = await Promise.all([
    supabase.from('cv_work_experiences').select('*').eq('cv_profile_id', profile.id).order('sort_order'),
    supabase.from('cv_education').select('*').eq('cv_profile_id', profile.id).order('sort_order'),
    supabase.from('cv_skills').select('*').eq('cv_profile_id', profile.id).order('sort_order'),
    supabase.from('cv_awards').select('*').eq('cv_profile_id', profile.id).order('sort_order'),
    supabase.from('cv_certifications').select('*').eq('cv_profile_id', profile.id).order('sort_order'),
  ])

  // Contact info from seeker_profiles + users
  const { data: seeker } = await supabase
    .from('seeker_profiles')
    .select('first_name, last_name, phone, location')
    .eq('user_id', userId)
    .single()

  const { data: { user } } = await supabase.auth.getUser()

  return {
    profile,
    contact: {
      first_name: seeker?.first_name ?? null,
      last_name: seeker?.last_name ?? null,
      email: user?.email ?? '',
      phone: seeker?.phone ?? null,
      location: seeker?.location ?? null,
    },
    experiences: experiences ?? [],
    education: education ?? [],
    skills: skills ?? [],
    awards: awards ?? [],
    certifications: certifications ?? [],
  }
}

/**
 * Recalculate and save the completion percentage for a CV profile.
 */
export async function recalculateCompletion(userId: string): Promise<number> {
  const cv = await fetchFullCv(userId)
  if (!cv) return 0

  const { percentage } = calculateCvCompletion(cv)

  const supabase = await createClient()
  await supabase
    .from('cv_profiles')
    .update({ completion_percentage: percentage })
    .eq('user_id', userId)

  return percentage
}
