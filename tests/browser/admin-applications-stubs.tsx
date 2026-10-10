import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
import {
  applicationScope, parseApplicantQuery, parseFilterQuery, parseOverviewQuery,
  type ApplicationDetail, type ApplicationJobRow, type JobApplicantRow,
} from '../../src/lib/admin-applications';

// Standalone browser fixture only. Every identity, job, application and response is synthetic.
const key = 'admin-applications-browser-fixture';
const event = 'admin-applications-fixture-navigation';
const uuid = (kind: number, n: number) => `${kind}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const JOB_ID = uuid(2, 1);
export const ZERO_JOB_ID = uuid(2, 65);
export const companies = [
  'Example Harbour Resort', 'Example Catering', 'Example Community Clinic',
  'Example Antigua and Barbuda Hospitality Training Company',
].map((name, n) => ({ id: uuid(1, n + 1), name }));
export const jobs: ApplicationJobRow[] = Array.from({ length: 65 }, (_, n) => ({
  id: uuid(2, n + 1),
  title: n === 0 ? 'Guest Services Associate' : n === 64 ? 'Zero applications role' : n === 1 ? 'Chef' : n === 2 ? 'Guest Experience and Community Programme Coordinator' : `Example role ${String(n + 1).padStart(2, '0')}`,
  status: n % 10 === 3 ? 'closed' : n % 10 === 4 ? 'pending_approval' : 'active',
  company: companies[n % companies.length], createdAt: new Date(Date.UTC(2026, 8, (n % 28) + 1, 12)).toISOString(),
  applicationCount: 0, latestApplicationAt: null,
}));
const statuses = ['applied', 'interview', 'hold', 'rejected'] as const;
const firstNames = ['Taylor', 'Jordan', 'Morgan', 'Alex', 'Samira', 'Avery'];
type FixtureApplication = JobApplicantRow & { jobId: string; userId: string };
const applications: FixtureApplication[] = Array.from({ length: 1205 }, (_, index) => {
  const n = index + 1;
  return {
    id: uuid(4, n), jobId: n <= 1005 ? JOB_ID : jobs[1 + ((n - 1006) % 63)].id,
    appliedAt: new Date(Date.UTC(2026, 8, 9 + (index % 30), 12, index % 60)).toISOString(),
    status: statuses[index % 4], userId: uuid(5, n),
    applicant: { id: uuid(3, n), firstName: firstNames[index % firstNames.length], lastName: `Example ${String(n).padStart(4, '0')}` },
  };
});
interface FixtureState {
  authUserId: string | null; authLoading: boolean; authDenied: boolean;
  overviewError: boolean; applicantsError: boolean; detailError: boolean;
  empty: boolean; resumeUnavailable: boolean;
  requests: { method: string; path: string; search: string; userId: string | null }[];
}
const defaults = (): FixtureState => ({ authUserId: uuid(9, 1), authLoading: false, authDenied: false, overviewError: false, applicantsError: false, detailError: false, empty: false, resumeUnavailable: false, requests: [] });
let state: FixtureState = JSON.parse(sessionStorage.getItem(key) || 'null') || defaults();
const persist = () => sessionStorage.setItem(key, JSON.stringify(state));
const subscribe = (listener: () => void) => {
  window.addEventListener(event, listener); window.addEventListener('popstate', listener);
  return () => { window.removeEventListener(event, listener); window.removeEventListener('popstate', listener); };
};
export function useFixtureLocation() { return useSyncExternalStore(subscribe, () => location.pathname + location.search); }
function navigate(href: string, replace = false) {
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) throw new Error('Fixture rejected external navigation');
  history[replace ? 'replaceState' : 'pushState']({}, '', url.href);
  window.dispatchEvent(new Event(event));
}
const router = { push: (href: string) => navigate(href), replace: (href: string) => navigate(href, true), back: () => history.back(), forward: () => history.forward(), prefetch: () => {}, refresh: () => window.dispatchEvent(new Event(event)) };
export function useRouter() { return router; }
export function usePathname() { useFixtureLocation(); return location.pathname; }
export function useSelectedLayoutSegment() { useFixtureLocation(); return location.pathname.split('/')[1] || null; }
export function useSearchParams() { const url = useFixtureLocation(); return useMemo(() => new URLSearchParams(url.split('?')[1] || ''), [url]); }
export const fixture = {
  reset(overrides: Partial<FixtureState> = {}) { state = { ...defaults(), ...overrides }; persist(); },
  configure(overrides: Partial<FixtureState>) { state = { ...state, ...overrides }; persist(); window.dispatchEvent(new Event(event)); },
  snapshot() { return structuredClone(state); },
  navigate, jobs, companies, jobId: JOB_ID, zeroJobId: ZERO_JOB_ID,
};
declare global { interface Window { __adminApplicationsFixture: typeof fixture } }
window.__adminApplicationsFixture = fixture;
export function useAuth() {
  useSyncExternalStore(subscribe, () => `${state.authUserId}:${state.authLoading}:${state.authDenied}`);
  return { isAuthenticated: !!state.authUserId, isLoading: state.authLoading, isAdminUser: !state.authDenied, userRole: state.authDenied ? 'seeker' : 'admin', avatarUrl: null,
    user: state.authUserId ? { id: state.authUserId, email: 'fixture-admin@example.test' } : null,
    logout: () => { throw new Error('Fixture rejected logout mutation'); }, setUserRole: () => {}, setAvatarUrl: () => {},
  };
}
export function createClient() {
  return { auth: { getUser: async () => ({ data: { user: { id: uuid(9, 1) } } }) },
    from: () => { throw new Error('Browser fixture forbids direct database access'); },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {},
  };
}
export function EmptyBadge() { return null; }
export default function Link({ href = '', onClick, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={href} {...props} onClick={e => {
    onClick?.(e);
    if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !props.target && !props.download) {
      e.preventDefault(); navigate(href);
    }
  }}>{children}</a>;
}
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
function scoped(from: string, to: string, status: string) {
  if (state.empty) return [];
  const start = Date.parse(`${from}T00:00:00-04:00`); const end = Date.parse(`${to}T23:59:59.999-04:00`);
  return applications.filter(a => Date.parse(a.appliedAt) >= start && Date.parse(a.appliedAt) <= end && (status === 'all' || a.status === status));
}
function overview(params: URLSearchParams) {
  const parsed = parseOverviewQuery(params); if (!parsed.value) return Response.json({ error: parsed.error }, { status: 400 });
  if (state.overviewError) return Response.json({ error: 'Synthetic application data is temporarily unavailable.' }, { status: 503 });
  const q = parsed.value;
  const eligible = state.empty ? [] : jobs.filter(j => (!q.companyId || j.company.id === q.companyId) && (!q.jobId || j.id === q.jobId) && (q.jobStatus === 'all' || q.jobStatus === j.status) && `${j.title} ${j.company.name}`.toLowerCase().includes(q.q.toLowerCase()));
  const ids = new Set(eligible.map(j => j.id)); const all = scoped(q.from, q.to, q.status).filter(a => ids.has(a.jobId));
  const counted = eligible.map(j => { const matching = all.filter(a => a.jobId === j.id); return { ...j, applicationCount: matching.length, latestApplicationAt: matching.map(a => a.appliedAt).sort().at(-1) || null }; });
  counted.sort((a, b) => {
    let order = 0;
    if (q.sort === 'applications_desc') order = b.applicationCount - a.applicationCount;
    if (q.sort === 'applications_asc') order = a.applicationCount - b.applicationCount;
    if (q.sort === 'job_asc') order = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    if (q.sort === 'company_asc') order = a.company.name.toLowerCase().localeCompare(b.company.name.toLowerCase());
    if (q.sort === 'newest_job') order = b.createdAt.localeCompare(a.createdAt);
    if (q.sort === 'latest') order = (b.latestApplicationAt || '').localeCompare(a.latestApplicationAt || '');
    return order || byId(a, b);
  });
  const trend = [];
  for (let day = Date.parse(`${q.from}T12:00:00Z`); day <= Date.parse(`${q.to}T12:00:00Z`); day += 86400000) {
    const date = new Date(day).toISOString().slice(0, 10);
    trend.push({ date, count: all.filter(a => a.appliedAt.slice(0, 10) === date).length });
  }
  return Response.json({ scope: applicationScope(q), page: q.page, limit: q.limit, totalJobs: eligible.length,
    summary: { applications: all.length, jobsWithApplications: new Set(all.map(a => a.jobId)).size, companiesWithApplications: new Set(all.map(a => jobs.find(j => j.id === a.jobId)!.company.id)).size,
      statusCounts: Object.fromEntries(statuses.map(s => [s, all.filter(a => a.status === s).length])) },
    jobs: counted.slice((q.page - 1) * q.limit, q.page * q.limit), trend,
  });
}
function applicants(jobId: string, params: URLSearchParams) {
  const parsed = parseApplicantQuery(params); if (!parsed.value) return Response.json({ error: parsed.error }, { status: 400 });
  if (state.applicantsError) return Response.json({ error: 'Synthetic applicants are temporarily unavailable.' }, { status: 503 });
  const q = parsed.value; const job = jobs.find(j => j.id === jobId);
  if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });
  const all = scoped(q.from, q.to, q.status).filter(a => a.jobId === jobId && `${a.applicant.firstName} ${a.applicant.lastName}`.toLowerCase().includes(q.applicantQ.toLowerCase()));
  all.sort((a, b) => (q.applicantSort === 'name' ? `${a.applicant.firstName} ${a.applicant.lastName}`.localeCompare(`${b.applicant.firstName} ${b.applicant.lastName}`) : q.applicantSort === 'oldest' ? a.appliedAt.localeCompare(b.appliedAt) : b.appliedAt.localeCompare(a.appliedAt)) || byId(a, b));
  return Response.json({ scope: applicationScope(q), page: q.applicantPage, limit: q.applicantLimit, job, totalCount: all.length,
    applications: all.slice((q.applicantPage - 1) * q.applicantLimit, q.applicantPage * q.applicantLimit).map(({ id, appliedAt, status, applicant }) => ({ id, appliedAt, status, applicant })),
  });
}
function detail(id: string) {
  if (state.detailError) return Response.json({ error: 'Synthetic applicant details are temporarily unavailable.' }, { status: 503 });
  const a = applications.find(a => a.id === id); if (!a) return Response.json({ error: 'Application not found.' }, { status: 404 });
  const job = jobs.find(j => j.id === a.jobId)!;
  const application: ApplicationDetail = {
    id: a.id, jobId: a.jobId, appliedAt: a.appliedAt, status: a.status,
    coverLetterText: 'This is a synthetic cover letter for browser testing.\n\nI would like to contribute my guest service experience and local knowledge to your team. I can discuss my availability and relevant experience in an interview.',
    job: { id: job.id, title: job.title, company: job.company },
    applicant: { ...a.applicant, userId: a.userId, email: `candidate-${a.id.slice(-4)}@example.test`, phone: '+1 268 555 0100', location: 'Example neighbourhood, Antigua and Barbuda' },
    resume: { label: 'Current résumé', uploadedHref: state.resumeUnavailable ? null : `/api/cv-download?profileId=${a.applicant.id}`, builtHref: state.resumeUnavailable ? null : `/api/cv/export?userId=${a.userId}` },
    notificationTracking: 'not_tracked',
  };
  return Response.json({ application });
}
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (url.origin !== location.origin) throw new Error('Fixture blocked external fetch');
  if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
  state.requests.push({ method, path: url.pathname, search: url.search, userId: state.authUserId }); persist();
  if (method !== 'GET') throw new Error(`Fixture blocked mutation: ${method} ${url.pathname}`);
  if (!state.authUserId || state.authDenied) return Response.json({ error: 'Synthetic admin session unavailable.' }, { status: state.authUserId ? 403 : 401 });
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (url.pathname === '/api/admin/applications/overview') return overview(url.searchParams);
  if (url.pathname === '/api/admin/applications/filters') {
    const parsed = parseFilterQuery(url.searchParams); if (!parsed.value) return Response.json({ error: parsed.error }, { status: 400 });
    const q = parsed.value;
    const items = (q.kind === 'company' ? companies : jobs.filter(j => !q.companyId || j.company.id === q.companyId).map(j => ({ id: j.id, name: j.title })))
      .filter(i => i.name.toLowerCase().includes(q.q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name) || byId(a, b));
    return Response.json({ items: items.slice((q.page - 1) * q.limit, q.page * q.limit), totalCount: items.length, page: q.page, limit: q.limit });
  }
  const applicantMatch = url.pathname.match(/^\/api\/admin\/applications\/jobs\/([^/]+)\/applicants$/);
  if (applicantMatch) return applicants(applicantMatch[1], url.searchParams);
  const detailMatch = url.pathname.match(/^\/api\/admin\/applications\/([^/]+)$/);
  if (detailMatch) return detail(detailMatch[1]);
  throw new Error(`Unexpected synthetic endpoint: ${url.pathname}`);
};
