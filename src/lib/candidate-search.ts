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

export interface CandidateSearchProfile {
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  location?: string | null;
  education?: string | null;
  skills?: (string | null)[] | null;
  certifications?: (string | null)[] | null;
  languages?: (string | null)[] | null;
  cv_skills?: (string | null)[] | null;
  cv_roles?: (string | null)[] | null;
  has_drivers_licence?: boolean | null;
  has_own_transport?: boolean | null;
}

export interface CandidateSearchWorkExperience {
  job_title?: string | null;
  company_name?: string | null;
}

export interface CandidateSearchSkill {
  name?: string | null;
}

export interface CandidateSearchCv {
  job_title?: string | null;
  summary?: string | null;
  work_experiences?: CandidateSearchWorkExperience[] | null;
  skills?: CandidateSearchSkill[] | null;
}

function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'");
}

export function tokenizeCandidateQuery(q: string): string[] {
  return normalizeSearchText(q)
    .split(/\s+/)
    .map((token) => token.replace(/^\p{P}+|\p{P}+$/gu, ""))
    .filter(Boolean);
}

export function buildCandidateHaystack(
  profile: CandidateSearchProfile,
  cv?: CandidateSearchCv | null,
): string {
  return normalizeSearchText([
    profile.first_name,
    profile.last_name,
    profile.bio,
    profile.location,
    profile.education,
    ...(profile.skills ?? []),
    ...(profile.certifications ?? []),
    ...(profile.languages ?? []),
    ...(profile.cv_skills ?? []),
    ...(profile.cv_roles ?? []),
    profile.has_drivers_licence
      ? "driver driver's licence drivers license driving licence"
      : null,
    profile.has_own_transport ? "own transport transportation vehicle" : null,
    cv?.job_title,
    cv?.summary,
    ...(cv?.work_experiences ?? []).flatMap((work) => [work.job_title, work.company_name]),
    ...(cv?.skills ?? []).map((skill) => skill.name),
  ].filter(Boolean).join(" "));
}

export function candidateMatchesQuery(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}
