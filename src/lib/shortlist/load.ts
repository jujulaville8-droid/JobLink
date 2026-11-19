import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeJobQueue,
  OVERRIDE_ACTIONS,
  type FitVerdictKind,
  type JobQueueItem,
  type OverrideAction,
  type ShortlistApplication,
  type ShortlistStatus,
  type VerdictInfo,
} from './ranking';

/**
 * Server-side loaders for the employer shortlist. Every read of the shortlist
 * tables (and of application_fit_verdicts) degrades to "empty" when the table is
 * missing or the query fails, so the feature renders before its migration lands.
 */

const VERDICT_KINDS: readonly FitVerdictKind[] = ['good_fit', 'not_a_fit', 'not_enough_information', 'unavailable'];
const STATUSES: readonly ShortlistStatus[] = ['applied', 'interview', 'rejected', 'hold'];
const IN_CHUNK = 200;

function chunks<T>(list: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function asStatus(value: unknown): ShortlistStatus {
  return STATUSES.includes(value as ShortlistStatus) ? (value as ShortlistStatus) : 'applied';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Like loadFitVerdicts, but also returns the verdict kind. */
export async function loadVerdictInfo(db: SupabaseClient, applicationIds: string[]): Promise<Map<string, VerdictInfo>> {
  const result = new Map<string, VerdictInfo>();
  if (!applicationIds.length) return result;
  try {
    for (const ids of chunks(applicationIds)) {
      const { data, error } = await db
        .from('application_fit_verdicts')
        .select('application_id, verdict, verdict_text')
        .in('application_id', ids);
      if (error) return new Map();
      for (const row of data ?? []) {
        if (typeof row.application_id !== 'string' || typeof row.verdict_text !== 'string') continue;
        if (!VERDICT_KINDS.includes(row.verdict as FitVerdictKind)) continue;
        result.set(row.application_id, { verdict: row.verdict as FitVerdictKind, verdict_text: row.verdict_text });
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

export async function loadOverrides(
  db: SupabaseClient,
  applicationIds: string[],
  employerUserId: string,
): Promise<Map<string, Set<OverrideAction>>> {
  const result = new Map<string, Set<OverrideAction>>();
  if (!applicationIds.length) return result;
  try {
    for (const ids of chunks(applicationIds)) {
      const { data, error } = await db
        .from('shortlist_overrides')
        .select('application_id, action')
        .eq('employer_id', employerUserId)
        .in('application_id', ids);
      if (error) return new Map();
      for (const row of data ?? []) {
        if (typeof row.application_id !== 'string' || !OVERRIDE_ACTIONS.includes(row.action as OverrideAction)) continue;
        const set = result.get(row.application_id) ?? new Set<OverrideAction>();
        set.add(row.action as OverrideAction);
        result.set(row.application_id, set);
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

export async function loadLastOpened(db: SupabaseClient, employerUserId: string, jobId: string): Promise<string | null> {
  try {
    const { data, error } = await db
      .from('shortlist_opens')
      .select('opened_at')
      .eq('employer_id', employerUserId)
      .eq('job_id', jobId)
      .maybeSingle();
    if (error || !data || typeof data.opened_at !== 'string') return null;
    return data.opened_at;
  } catch {
    return null;
  }
}

/**
 * Records that the employer opened this shortlist now. Never throws.
 * Throttled: a re-render within OPEN_RECORD_MIN_AGE_MS of the stored open does
 * not move opened_at, so "new" markers computed from the stored value survive
 * in-visit refreshes (every triage action refreshes the page) and only clear
 * on a genuinely later visit.
 */
export const OPEN_RECORD_MIN_AGE_MS = 15 * 60 * 1000;

export async function recordShortlistOpen(db: SupabaseClient, employerUserId: string, jobId: string): Promise<boolean> {
  try {
    const existing = await loadLastOpened(db, employerUserId, jobId);
    if (existing && Date.now() - new Date(existing).getTime() < OPEN_RECORD_MIN_AGE_MS) return true;
    const { error } = await db
      .from('shortlist_opens')
      .upsert(
        { employer_id: employerUserId, job_id: jobId, opened_at: new Date().toISOString() },
        { onConflict: 'employer_id,job_id' },
      );
    return !error;
  } catch {
    return false;
  }
}

export interface ShortlistJob {
  id: string;
  title: string;
  status: string | null;
  description: string | null;
  category: string | null;
}

export interface ShortlistData {
  job: ShortlistJob | null;
  applications: ShortlistApplication[];
  verdicts: Map<string, VerdictInfo>;
  overrides: Map<string, Set<OverrideAction>>;
  lastOpenedAt: string | null;
}

const BASE_SEEKER_FIELDS = 'id, first_name, last_name, location, experience_years, skills, bio, education, cv_url, phone';

function applicationSelect(withCvSkills: boolean): string {
  const seeker = withCvSkills ? `${BASE_SEEKER_FIELDS}, cv_skills` : BASE_SEEKER_FIELDS;
  return `id, status, applied_at, cover_letter_text, seeker_profiles!applications_seeker_id_fkey ( ${seeker} )`;
}

type RawApplication = {
  id: string;
  status: unknown;
  applied_at: string;
  cover_letter_text: string | null;
  seeker_profiles: Record<string, unknown> | Record<string, unknown>[] | null;
};

function toShortlistApplication(row: RawApplication): ShortlistApplication {
  const raw = Array.isArray(row.seeker_profiles) ? row.seeker_profiles[0] ?? null : row.seeker_profiles;
  return {
    id: row.id,
    applied_at: row.applied_at,
    status: asStatus(row.status),
    cover_letter_text: typeof row.cover_letter_text === 'string' ? row.cover_letter_text : null,
    seeker: raw
      ? {
          id: String(raw.id ?? ''),
          first_name: typeof raw.first_name === 'string' ? raw.first_name : null,
          last_name: typeof raw.last_name === 'string' ? raw.last_name : null,
          location: typeof raw.location === 'string' ? raw.location : null,
          experience_years: typeof raw.experience_years === 'number' ? raw.experience_years : null,
          skills: asStringArray(raw.skills),
          cv_skills: asStringArray(raw.cv_skills),
          bio: typeof raw.bio === 'string' ? raw.bio : null,
          education: typeof raw.education === 'string' ? raw.education : null,
          cv_url: typeof raw.cv_url === 'string' ? raw.cv_url : null,
        }
      : null,
  };
}

async function loadApplications(db: SupabaseClient, jobId: string): Promise<ShortlistApplication[]> {
  // cv_skills may not exist yet (its migration ships separately): retry without it.
  for (const withCvSkills of [true, false]) {
    try {
      const { data, error } = await db
        .from('applications')
        .select(applicationSelect(withCvSkills))
        .eq('job_id', jobId)
        .order('applied_at', { ascending: false });
      if (error) continue;
      return ((data ?? []) as unknown as RawApplication[]).map(toShortlistApplication);
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Everything buildShortlist needs for one job. Callers must already have verified
 * the job belongs to the employer's company.
 */
export async function loadShortlistData(db: SupabaseClient, jobId: string, employerUserId: string): Promise<ShortlistData> {
  let job: ShortlistJob | null = null;
  try {
    const { data, error } = await db
      .from('job_listings')
      .select('id, title, status, description, category')
      .eq('id', jobId)
      .maybeSingle();
    if (!error && data) {
      job = {
        id: data.id,
        title: data.title ?? '',
        status: data.status ?? null,
        description: data.description ?? null,
        category: data.category ?? null,
      };
    }
  } catch {
    job = null;
  }

  const applications = await loadApplications(db, jobId);
  const ids = applications.map(a => a.id);
  const [verdicts, overrides, lastOpenedAt] = await Promise.all([
    loadVerdictInfo(db, ids),
    loadOverrides(db, ids, employerUserId),
    loadLastOpened(db, employerUserId, jobId),
  ]);
  return { job, applications, verdicts, overrides, lastOpenedAt };
}

/** The employer's jobs ranked by attention needed (computeJobQueue output). */
export async function loadHiringQueue(db: SupabaseClient, companyId: string, employerUserId: string): Promise<JobQueueItem[]> {
  try {
    const { data: listings, error } = await db
      .from('job_listings')
      .select('id, title, status')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error || !listings?.length) return [];
    const jobIds = listings.map(l => l.id as string);

    const apps: { id: string; job_id: string; applied_at: string; status: string }[] = [];
    for (const ids of chunks(jobIds)) {
      const { data, error: appError } = await db
        .from('applications')
        .select('id, job_id, applied_at, status')
        .in('job_id', ids);
      if (appError) return [];
      apps.push(...((data ?? []) as typeof apps));
    }

    const verdictInfo = await loadVerdictInfo(db, apps.map(a => a.id));

    const opens = new Map<string, string>();
    try {
      const { data, error: opensError } = await db
        .from('shortlist_opens')
        .select('job_id, opened_at')
        .eq('employer_id', employerUserId);
      if (!opensError) for (const row of data ?? []) opens.set(row.job_id as string, row.opened_at as string);
    } catch {
      // Table not installed yet: treat every job as never opened.
    }

    return computeJobQueue(
      listings.map(listing => {
        const jobApps = apps.filter(a => a.job_id === listing.id);
        const verdicts = new Map<string, FitVerdictKind>();
        for (const a of jobApps) {
          const v = verdictInfo.get(a.id);
          if (v) verdicts.set(a.id, v.verdict);
        }
        return {
          id: listing.id as string,
          title: (listing.title as string) ?? '',
          status: (listing.status as string) ?? null,
          applications: jobApps,
          verdicts,
          lastOpenedAt: opens.get(listing.id as string) ?? null,
        };
      }),
    );
  } catch {
    return [];
  }
}
