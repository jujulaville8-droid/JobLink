import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
import { resumeFixture } from '../fixtures/resume';

// All identities, jobs, profiles, and responses in this file are synthetic.
// This adapter is imported only by the standalone Vite browser fixture.
const STORAGE_KEY = 'application-completion-fixture';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const JOB_ID = '22222222-2222-4222-8222-222222222222';
const defaultProfile = {
  id: '44444444-4444-4444-8444-444444444444', first_name: 'Jamie', last_name: 'Example',
  phone: '+1 268 555 0100', location: 'Antigua', bio: '', skills: [], experience_years: null,
  education: '', cv_url: `${USER_ID}/synthetic-resume.pdf`, avatar_url: '', visibility: 'actively_looking',
};
interface FixtureState {
  user: { id: string; email: string } | null;
  role: string | null;
  profile: typeof defaultProfile | null;
  builtResume: boolean;
  profileFailure: boolean;
  submitFailure: boolean;
  submitDuplicate: boolean;
  applied: string[];
  requests: { path: string; method: string; body: Record<string, unknown> | null }[];
  resume: typeof resumeFixture;
}
const defaults = (): FixtureState => ({
  user: { id: USER_ID, email: 'jamie@example.test' }, role: 'seeker', profile: { ...defaultProfile },
  builtResume: false, profileFailure: false, submitFailure: false, submitDuplicate: false, applied: [], requests: [],
  resume: structuredClone(resumeFixture),
});
let state: FixtureState = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') || defaults();
let revision = 0;
function persist() { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function publish() { persist(); revision += 1; window.dispatchEvent(new Event('completion-fixture-change')); }
function subscribe(callback: () => void) {
  window.addEventListener('completion-fixture-change', callback);
  return () => window.removeEventListener('completion-fixture-change', callback);
}
export function useFixtureRevision() { return useSyncExternalStore(subscribe, () => revision); }
export const fixture = {
  reset(options: Partial<FixtureState> = {}) { state = { ...defaults(), ...options }; publish(); },
  configure(options: Partial<FixtureState>) { state = { ...state, ...options }; publish(); },
  snapshot() { return structuredClone(state); },
};
declare global { interface Window { __completionFixture: typeof fixture } }
window.__completionFixture = fixture;
persist();

const setAvatarUrl = () => {};
export function useAuth() {
  useFixtureRevision();
  return { user: state.user, userRole: state.role, isAuthenticated: !!state.user, isLoading: false, setAvatarUrl };
}
export function useParams() { return { id: window.location.pathname.split('/')[2] || JOB_ID }; }
export function useSearchParams() { return new URLSearchParams(window.location.search); }
export function useRouter() { return { push: (url: string) => { window.location.href = url; }, replace: (url: string) => window.location.replace(url) }; }
export default function Link({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={href} {...props}>{children}</a>;
}

export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const result = async () => {
        let data: unknown = null;
        if (table === 'job_listings') data = { id: filters.id, title: 'Synthetic Guest Services Assistant', location: 'Antigua', job_type: 'full_time', status: 'active', company: { company_name: 'Fixture Hospitality' } };
        else if (table === 'users') data = { role: state.role };
        else if (table === 'seeker_profiles') data = state.profile;
        else if (table === 'cv_profiles') data = state.builtResume ? { id: 'synthetic-cv', completion_percentage: 70 } : null;
        else if (table === 'applications') data = state.applied.includes(String(filters.job_id)) ? { id: 'synthetic-application' } : null;
        else throw new Error(`Unexpected synthetic table: ${table}`);
        return { data, error: null };
      };
      const query = { select: () => query, eq: (field: string, value: unknown) => { filters[field] = value; return query; }, single: result, maybeSingle: result };
      return query;
    },
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: '/synthetic-resume.pdf' }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '/logo-icon.png' } }),
    }) },
  };
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error(`Fixture blocked external fetch: ${url.origin}`);
  if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
  const method = init?.method || 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  state.requests.push({ path: url.pathname, method, body });
  persist();
  if (url.pathname === '/api/profile' && method === 'POST') {
    if (state.profileFailure) return Response.json({ error: 'Synthetic profile save failed. Please try again.' }, { status: 503 });
    state.profile = { ...defaultProfile, ...body, id: body.profile_id || defaultProfile.id };
    persist();
    return Response.json({ success: true, profile_id: state.profile!.id });
  }
  if (url.pathname === '/api/jobs/apply' && method === 'POST') {
    if (state.submitFailure) return Response.json({ error: 'Synthetic submission failed. Please try again.' }, { status: 503 });
    if (state.submitDuplicate) return Response.json({ error: 'Synthetic application already exists.' }, { status: 409 });
    state.applied.push(body.job_id);
    persist();
    return Response.json({ success: true });
  }
  if (url.pathname === '/api/cv/studio') {
    if (method === 'GET') {
      state.builtResume = true;
      persist();
      return Response.json(state.resume);
    }
    if (body?.section === 'profile') {
      Object.assign(state.resume.profile, body.entry);
      state.builtResume = true;
      persist();
      return Response.json({ entry: state.resume.profile });
    }
  }
  throw new Error(`Unexpected synthetic endpoint: ${method} ${url.pathname}`);
};
