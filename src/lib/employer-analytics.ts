import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getJobClosure } from '@/lib/job-closures';
import { jobViewsLaunch } from '@/lib/job-views-config';

export const antiguaDay = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Antigua', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
export function analyticsPeriod(days: 7 | 30, asOf = new Date()) {
  // Antigua is UTC-04 year round; use local calendar midnight, never host timezone.
  const midnight = new Date(`${antiguaDay(asOf)}T00:00:00-04:00`);
  const start = new Date(midnight.getTime() - (days - 1) * 86400000);
  return { start: start.toISOString(), end: asOf.toISOString(), days,
    dates: Array.from({ length: days }, (_, i) => antiguaDay(new Date(start.getTime() + i * 86400000))) };
}
export type Period = ReturnType<typeof analyticsPeriod>;
export type Listing = { id: string; title: string; status: string; created_at: string; company_id: string; applications: { count: number }[] };
export type Application = { id: string; job_id: string; applied_at: string; status: string };
export function summarize(listings: Listing[], applications: Application[], period: Period) {
  const daily = Object.fromEntries(period.dates.map(day => [day, 0]));
  const statuses: Record<string, number> = { applied: 0, interview: 0, hold: 0, rejected: 0, unknown: 0 };
  const perJob: Record<string, number> = {};
  const inventory: Record<string, number> = { active: 0, pending: 0, closed: 0, draft: 0 };
  const cohort = applications.filter(a => Date.parse(a.applied_at) >= Date.parse(period.start) && Date.parse(a.applied_at) < Date.parse(period.end));
  for (const a of cohort) {
    const key = antiguaDay(new Date(a.applied_at));
    if (!Object.hasOwn(daily, key)) throw new Error('Application outside period');
    daily[key]++;
    statuses[Object.hasOwn(statuses, a.status) ? a.status : 'unknown']++;
    perJob[a.job_id] = (perJob[a.job_id] ?? 0) + 1;
  }
  const rows = listings.map(job => {
    const closure = getJobClosure(job.id, job.company_id, new Date(period.end));
    const status = job.status === 'active' && closure ? 'closed' : job.status === 'pending_approval' ? 'pending' : job.status;
    inventory[status] = (inventory[status] ?? 0) + 1;
    return { ...job, status, closure: closure?.reason, periodApplications: perJob[job.id] ?? 0,
      allApplications: job.applications[0]?.count ?? 0,
      age: Math.max(0, Math.floor((Date.parse(period.end) - Date.parse(job.created_at)) / 86400000)) };
  });
  return { daily, statuses, inventory, rows, applications: cohort.length };
}

// Keyset pagination works even if PostgREST's configured maximum is below our batch size.
export async function readAll<T extends { id: string }>(read: (after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const result = await read(after);
    if (result.error || !result.data) throw new Error('Analytics query unavailable');
    if (!result.data.length) return rows;
    const last = result.data[result.data.length - 1].id;
    if (after !== null && last <= after) throw new Error('Analytics pagination did not advance');
    rows.push(...result.data);
    after = last;
  }
}

async function employerScope() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error) return { state: 'error' } as const;
  if (!user) return { state: 'unauthenticated' } as const;
  const role = await db.from('users').select('role,email_verified').eq('id', user.id).single();
  if (role.error || !role.data) return { state: 'denied' } as const;
  if (!user.email_confirmed_at || role.data.email_verified !== true) return { state: 'unverified' } as const;
  if (role.data.role !== 'employer') return { state: 'denied' } as const;
  const company = await db.from('companies').select('id,company_name').eq('user_id', user.id).maybeSingle();
  if (company.error) return { state: 'error' } as const;
  if (!company.data) return { state: 'setup' } as const;
  return { state: 'authorized', db, userId: user.id, company: company.data } as const;
}

// Private adapter: its only caller has resolved the DB role and company with the session.
async function readViews(companyId: string, period: Period, launch: Date) {
  try {
    const span = Date.parse(period.end) - Date.parse(period.start);
    if (span <= 0 || span > 31 * 86400000) throw new Error('Views range out of bounds');
    const start = new Date(Math.max(Date.parse(period.start), launch.getTime())).toISOString();
    const admin = createAdminClient();
    const daily: Record<string, number | null> = Object.fromEntries(period.dates.map(day =>
      [day, Date.parse(`${day}T00:00:00-04:00`) + 86400000 <= launch.getTime() ? null : 0]));
    const partialDays = period.dates.filter(day => {
      const dayStart = Date.parse(`${day}T00:00:00-04:00`);
      return dayStart < launch.getTime() && launch.getTime() < dayStart + 86400000;
    });
    const perJob: Record<string, number> = {};
    let total = 0;
    // RPC output can exceed the API row cap: paginate stable groups as well.
    for (let offset = 0;;) {
      const { data, error } = await admin.rpc('employer_job_view_counts', {
        p_company_id: companyId, p_start: start, p_end: period.end,
      }).order('job_id').order('day').range(offset, offset + 499);
      if (error || !data) throw new Error('Views unavailable');
      if (!data.length) break;
      for (const row of data as { job_id: string; day: string; views: number | string }[]) {
        const count = Number(row.views);
        if (!Number.isSafeInteger(count) || count < 0 || !Object.hasOwn(daily, row.day)) throw new Error('Invalid view aggregate');
        daily[row.day] = (daily[row.day] ?? 0) + count;
        perJob[row.job_id] = (perJob[row.job_id] ?? 0) + count;
        total += count;
      }
      offset += data.length;
    }
    return { state: 'available' as const, launch: launch.toISOString(), daily, partialDays, perJob, total };
  } catch {
    return { state: 'error' as const, launch: launch.toISOString() };
  }
}

export async function getEmployerAnalytics(days: 7 | 30 = 30) {
  const asOf = new Date();
  const period = analyticsPeriod(days === 7 ? 7 : 30, asOf);
  try {
    const scope = await employerScope();
    if (scope.state !== 'authorized') return scope;
    const { db, company, userId } = scope;
    const launch = jobViewsLaunch(asOf);
    const listingsRead = readAll<Listing>(after => {
      let q = db.from('job_listings').select('id,title,status,created_at,company_id,applications(count)').eq('company_id', company.id).order('id').limit(500);
      if (after) q = q.gt('id', after);
      return q;
    });
    const applicationsRead = readAll<Application>(after => {
      let q = db.from('applications').select('id,job_id,applied_at,status,job_listings!inner(company_id)')
        .eq('job_listings.company_id', company.id).gte('applied_at', period.start).lt('applied_at', period.end).order('id').limit(500);
      if (after) q = q.gt('id', after);
      return q;
    });
    const messagesRead = readAll<{ id: string; sender_id: string }>(after => {
      let q = db.from('messages').select('id,sender_id,conversations!inner(applications!inner(job_listings!inner(company_id)),conversation_participants!inner(user_id))')
        .eq('conversations.applications.job_listings.company_id', company.id)
        .eq('conversations.conversation_participants.user_id', userId)
        .gte('created_at', period.start).lt('created_at', period.end).order('id').limit(500);
      if (after) q = q.gt('id', after);
      return q;
    }).then(messages => {
      const unique = [...new Map(messages.map(m => [m.id, m])).values()];
      return { state: 'available' as const, sent: unique.filter(m => m.sender_id === userId).length, received: unique.filter(m => m.sender_id !== userId).length };
    }).catch(() => ({ state: 'error' as const }));
    const [listings, applications, total, messages, views] = await Promise.all([
      listingsRead, applicationsRead,
      db.from('applications').select('id,job_listings!inner(company_id)', { count: 'exact', head: true }).eq('job_listings.company_id', company.id),
      messagesRead, launch ? readViews(company.id, period, launch) : null,
    ]);
    if (total.error || total.count === null) throw new Error('Applications unavailable');
    return { state: 'available' as const, companyName: company.company_name as string, period,
      ...summarize(listings, applications, period), allApplications: total.count, messages, views };
  } catch {
    return { state: 'error' } as const;
  }
}
export type Analytics = Extract<Awaited<ReturnType<typeof getEmployerAnalytics>>, { state: 'available' }>;
