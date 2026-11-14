import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { validateProfessionalProjectionData, type ProfessionalProjectionData, type ProfessionalSourceRecord } from './professional-projection'

export type BasicProfessionalProfile = Readonly<{
  bio?: unknown; workDescriptions?: unknown; jobTitle?: unknown; workTitles?: unknown; cvSkills?: unknown; seekerSkills?: unknown
}>
/** Keep source semantics and qualifiers intact; never promote a skill to work
 * experience. Drop unsafe fields independently without rewriting their meaning. */
export function projectBasicProfile(input: BasicProfessionalProfile): ProfessionalProjectionData | null {
  const records: ProfessionalSourceRecord[] = []
  const add = (section: ProfessionalSourceRecord['section'], prefix: string, value: unknown, narrative = false) => {
    if (typeof value !== 'string' || !value.trim()) return
    if (value.length > (narrative ? 7800 : 300) || (!narrative && /[\r\n]/.test(value)) || records.length >= 40) return
    const candidate = { id: `r${records.length + 1}`, section, text: `${prefix}${value.trim()}`, order: records.length }
    if (validateProfessionalProjectionData({ records: [...records, candidate], coverage: 'partial', omissions: { professionalContent: true, unclassifiedContent: false, limitReached: false }, overallQualityScoreAllowed: false })) records.push(candidate)
  }
  try {
    add('summary', 'Profile description: ', input.bio, true)
    add('summary', 'CV profile title (not work history): ', input.jobTitle)
    for (const [values, section, prefix] of [
      [input.workTitles, 'work', 'Work history title: '],
      [input.workDescriptions, 'work', 'Work history: '],
      [input.cvSkills, 'skills', 'Declared CV skill: '],
      [input.seekerSkills, 'skills', 'Declared profile skill: '],
    ] as const) {
      if (values == null) continue
      if (!Array.isArray(values)) continue
      for (const value of values.slice(0, 40)) add(section, prefix, value, prefix === 'Work history: ')
    }
    if (!records.length) return null
    return validateProfessionalProjectionData({ records, coverage: 'partial',
      omissions: { professionalContent: true, unclassifiedContent: false, limitReached: false }, overallQualityScoreAllowed: false })
  } catch { return null }
}
/** Only called after inline and narrative privacy/notice gates. Ownership is
 * bound by auth user, then by the owned CV id; no identity/contact columns. */
export async function loadBasicProfile(db: SupabaseClient, userId: string, signal: AbortSignal): Promise<BasicProfessionalProfile> {
  const [profile, seeker] = await Promise.all([
    db.from('cv_profiles').select('id, job_title').eq('user_id', userId).abortSignal(signal).maybeSingle(),
    db.from('seeker_profiles').select('skills, bio').eq('user_id', userId).abortSignal(signal).maybeSingle(),
  ])
  if (profile.error || seeker.error) throw new Error('Basic profile unavailable')
  let workTitles: unknown[] = [], workDescriptions: unknown[] = [], cvSkills: unknown[] = []
  if (profile.data) {
    const [work, skills] = await Promise.all([
      db.from('cv_work_experiences').select('job_title, description').eq('cv_profile_id', profile.data.id).order('sort_order').limit(12).abortSignal(signal),
      db.from('cv_skills').select('name').eq('cv_profile_id', profile.data.id).order('sort_order').limit(12).abortSignal(signal),
    ])
    if (work.error || skills.error) throw new Error('Basic profile unavailable')
    workTitles = (work.data ?? []).map(row => row.job_title)
    workDescriptions = (work.data ?? []).filter(row => typeof row.description === 'string' && row.description.trim()).map(row => typeof row.job_title === 'string' ? `${row.job_title}: ${row.description}` : row.description)
    cvSkills = (skills.data ?? []).map(row => row.name)
  }
  return { bio: seeker.data?.bio, workDescriptions, jobTitle: profile.data?.job_title, workTitles, cvSkills, seekerSkills: seeker.data?.skills }
}
