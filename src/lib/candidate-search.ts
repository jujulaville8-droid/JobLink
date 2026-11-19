import { ilikePattern } from './safe-sql'

export function candidateKeywordFilter(term: string) {
  const keyword = ilikePattern(term)
  return ['first_name', 'last_name', 'bio', 'education', 'candidate_skill_search']
    .map(field => `${field}.ilike.${keyword}`).join(',')
}

export function candidateMatchesSkills(profile: { skills?: string[] | null; cv_skills?: string[] | null; cv_roles?: string[] | null }, terms: string[]) {
  return [...(profile.skills ?? []), ...(profile.cv_skills ?? []), ...(profile.cv_roles ?? [])]
    .some(skill => terms.some(term => skill.toLowerCase().includes(term)))
}
