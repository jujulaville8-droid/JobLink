/**
 * Employer shortlist ranking. Pure: no server imports, safe to unit test and to
 * import types from client components.
 *
 * The internal match score orders good_fit candidates among themselves and is
 * NEVER shown. Server code must pass entries through `toClientEntry` (which drops
 * the score) before handing them to any client component.
 */

export type FitVerdictKind = 'good_fit' | 'not_a_fit' | 'not_enough_information' | 'unavailable';
export type OverrideAction = 'pin' | 'remove' | 'interview';
export type ShortlistStatus = 'applied' | 'interview' | 'rejected' | 'hold';
export type ShortlistGroup = 'good_fit' | 'not_enough_information' | 'not_a_fit' | 'unscreened';

export const SHORTLIST_TOP_N = 5;
export const OVERRIDE_ACTIONS: readonly OverrideAction[] = ['pin', 'remove', 'interview'];

export interface ShortlistSeeker {
  id: string;
  first_name: string | null;
  last_name: string | null;
  location?: string | null;
  experience_years?: number | null;
  skills?: string[] | null;
  cv_skills?: string[] | null;
  bio?: string | null;
  education?: string | null;
  cv_url?: string | null;
}

export interface ShortlistApplication {
  id: string;
  applied_at: string;
  status: ShortlistStatus;
  cover_letter_text?: string | null;
  seeker: ShortlistSeeker | null;
}

export interface VerdictInfo {
  verdict: FitVerdictKind;
  verdict_text: string;
}

export interface ShortlistJobText {
  title: string;
  description?: string | null;
  category?: string | null;
}

export interface MatchedSkill {
  name: string;
  /** True when the match came only from the parsed CV (cv_skills), not the profile. */
  fromResume: boolean;
}

export interface ShortlistEntry {
  application: ShortlistApplication;
  verdict: VerdictInfo | null;
  group: ShortlistGroup;
  /** Internal ordering value. Never render, never send to the client. */
  score: number;
  isPinned: boolean;
  isNew: boolean;
  hasInterview: boolean;
  matchedSkills: MatchedSkill[];
  otherSkills: string[];
}

export type ClientShortlistEntry = Omit<ShortlistEntry, 'score'>;

export interface ShortlistInput {
  job: ShortlistJobText;
  applications: ShortlistApplication[];
  verdicts: Map<string, VerdictInfo>;
  overrides: Map<string, Set<OverrideAction>>;
}

export interface ShortlistResult {
  /** Ranked shortlist, best first. */
  entries: ShortlistEntry[];
  /** Candidates the employer passed on (override 'remove'), newest first. */
  passed: ShortlistEntry[];
}

// ---------- keyword matching ----------

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'you', 'your', 'our', 'are', 'will', 'from', 'this', 'that', 'have',
  'has', 'who', 'all', 'any', 'can', 'not', 'but', 'job', 'role', 'work', 'must', 'able', 'into',
  'per', 'out', 'their', 'they', 'them', 'his', 'her', 'its', 'was', 'were', 'been', 'also', 'more',
  'other', 'such', 'than', 'very', 'well', 'what', 'when', 'where', 'which', 'while', 'about',
  'year', 'years', 'experience', 'required', 'requirements', 'preferred', 'including', 'skills',
  'applicant', 'applicants', 'candidate', 'candidates', 'position', 'team', 'join', 'looking',
  'should', 'would', 'please', 'apply', 'antigua', 'barbuda',
]);

function stem(token: string): string {
  const stripped = token.replace(/(ings|ing|ers|er|es|ed|e|s)$/, '');
  return stripped.length >= 3 ? stripped : token;
}

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
    .map(stem);
}

export interface JobKeywords {
  all: Set<string>;
  title: Set<string>;
}

/** job_listings has no requirements column: keywords come from title + description + category. */
export function jobKeywords(job: ShortlistJobText): JobKeywords {
  const title = new Set(tokenize(job.title));
  const all = new Set([...title, ...tokenize(job.description), ...tokenize(job.category)]);
  return { all, title };
}

function uniqueSkills(list: (string | null | undefined)[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function skillMatches(skill: string, keywords: JobKeywords): { matched: boolean; strength: number } {
  const tokens = tokenize(skill);
  if (!tokens.length) return { matched: false, strength: 0 };
  const hits = tokens.filter(t => keywords.all.has(t)).length;
  if (!hits) return { matched: false, strength: 0 };
  const titleHits = tokens.filter(t => keywords.title.has(t)).length;
  // Full-phrase match weighs 1, partial 0.5; skills echoing the job title weigh extra.
  const base = hits === tokens.length ? 1 : 0.5;
  return { matched: true, strength: base + (titleHits > 0 ? 1 : 0) };
}

export interface SkillMatchResult {
  matched: MatchedSkill[];
  other: string[];
  strength: number;
}

export function matchSkills(seeker: ShortlistSeeker | null, keywords: JobKeywords): SkillMatchResult {
  const profile = uniqueSkills(seeker?.skills);
  const profileKeys = new Set(profile.map(s => s.toLowerCase()));
  const cvOnly = uniqueSkills(seeker?.cv_skills).filter(s => !profileKeys.has(s.toLowerCase()));
  const matched: MatchedSkill[] = [];
  const other: string[] = [];
  let strength = 0;
  for (const [name, fromResume] of [
    ...profile.map(s => [s, false] as const),
    ...cvOnly.map(s => [s, true] as const),
  ]) {
    const m = skillMatches(name, keywords);
    if (m.matched) {
      matched.push({ name, fromResume });
      strength += m.strength;
    } else {
      other.push(name);
    }
  }
  return { matched, other, strength };
}

/**
 * Internal match strength: weighted skill overlap with the job keyword set plus a
 * small, capped experience signal. Ordering value only; never displayed.
 */
export function matchScore(seeker: ShortlistSeeker | null, keywords: JobKeywords): number {
  const { strength } = matchSkills(seeker, keywords);
  const years = typeof seeker?.experience_years === 'number' && seeker.experience_years > 0 ? seeker.experience_years : 0;
  return strength + Math.min(years, 10) * 0.1;
}

// ---------- ranking ----------

const GROUP_ORDER: Record<ShortlistGroup, number> = {
  good_fit: 0,
  not_enough_information: 1,
  not_a_fit: 2,
  unscreened: 3,
};

function time(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function newestFirst(a: ShortlistEntry, b: ShortlistEntry): number {
  return time(b.application.applied_at) - time(a.application.applied_at);
}

function compareEntries(a: ShortlistEntry, b: ShortlistEntry): number {
  const g = GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
  if (g) return g;
  if (a.group === 'good_fit' && b.score !== a.score) return b.score - a.score;
  return newestFirst(a, b);
}

export function buildShortlist(input: ShortlistInput): ShortlistResult {
  const keywords = jobKeywords(input.job);
  const entries: ShortlistEntry[] = [];
  const passed: ShortlistEntry[] = [];

  for (const application of input.applications) {
    const verdict = input.verdicts.get(application.id) ?? null;
    if (verdict?.verdict === 'unavailable') continue;
    const actions = input.overrides.get(application.id) ?? new Set<OverrideAction>();
    const group: ShortlistGroup = verdict ? (verdict.verdict as Exclude<FitVerdictKind, 'unavailable'>) : 'unscreened';
    const skills = matchSkills(application.seeker, keywords);
    const entry: ShortlistEntry = {
      application,
      verdict,
      group,
      score: matchScore(application.seeker, keywords),
      isPinned: actions.has('pin'),
      isNew: false,
      hasInterview: application.status === 'interview' || actions.has('interview'),
      matchedSkills: skills.matched,
      otherSkills: skills.other,
    };
    if (actions.has('remove')) passed.push(entry);
    else entries.push(entry);
  }

  entries.sort(compareEntries);
  passed.sort(newestFirst);
  return { entries, passed };
}

/**
 * Marks entries that newly entered the top N since the employer last opened this
 * shortlist (or all top-N entries when it has never been opened).
 */
export function applyNewMarkers<T extends { application: { applied_at: string }; isNew: boolean }>(
  entries: T[],
  previousOpenedAt: string | null,
  topN = SHORTLIST_TOP_N,
): T[] {
  const since = previousOpenedAt ? time(previousOpenedAt) : null;
  return entries.map((entry, index) => ({
    ...entry,
    isNew: index < topN && (since === null || time(entry.application.applied_at) > since),
  }));
}

/** The rows to show: top N by default, everything when expanded. */
export function visibleEntries<T>(entries: T[], expanded: boolean, topN = SHORTLIST_TOP_N): T[] {
  return expanded ? entries : entries.slice(0, topN);
}

export function toClientEntry(entry: ShortlistEntry): ClientShortlistEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { score, ...rest } = entry;
  return rest;
}

// ---------- progress ----------

export interface ProgressApplication {
  id: string;
  status: ShortlistStatus;
  overrides?: Iterable<OverrideAction>;
}

export interface ShortlistProgress {
  reviewed: number;
  total: number;
  interviewReady: number;
}

export function shortlistProgress(
  entries: Pick<ShortlistEntry, 'application' | 'isPinned' | 'hasInterview'>[],
  allApplications: ProgressApplication[],
): ShortlistProgress {
  const touchedByEntry = new Set(entries.filter(e => e.isPinned || e.hasInterview).map(e => e.application.id));
  let reviewed = 0;
  let interviewReady = 0;
  for (const app of allApplications) {
    const hasOverride = app.overrides ? [...app.overrides].length > 0 : false;
    if (hasOverride || app.status !== 'applied' || touchedByEntry.has(app.id)) reviewed++;
    if (app.status === 'interview') interviewReady++;
  }
  return { reviewed, total: allApplications.length, interviewReady };
}

// ---------- hiring queue ----------

export interface QueueJobInput {
  id: string;
  title: string;
  status?: string | null;
  applications: { id: string; applied_at: string; status?: ShortlistStatus | string | null }[];
  verdicts: Map<string, FitVerdictKind>;
  lastOpenedAt: string | null;
}

export interface JobQueueItem {
  jobId: string;
  title: string;
  status: string | null;
  applicationCount: number;
  strongFitCount: number;
  newCount: number;
}

export function computeJobQueue(jobs: QueueJobInput[]): JobQueueItem[] {
  const items = jobs.map(job => {
    const since = job.lastOpenedAt ? time(job.lastOpenedAt) : null;
    return {
      jobId: job.id,
      title: job.title,
      status: job.status ?? null,
      applicationCount: job.applications.length,
      strongFitCount: job.applications.filter(a => job.verdicts.get(a.id) === 'good_fit').length,
      newCount: since === null ? job.applications.length : job.applications.filter(a => time(a.applied_at) > since).length,
    };
  });
  return items.sort((a, b) => {
    const emptyA = a.applicationCount === 0 ? 1 : 0;
    const emptyB = b.applicationCount === 0 ? 1 : 0;
    return (
      emptyA - emptyB ||
      b.newCount - a.newCount ||
      b.strongFitCount - a.strongFitCount ||
      b.applicationCount - a.applicationCount
    );
  });
}
