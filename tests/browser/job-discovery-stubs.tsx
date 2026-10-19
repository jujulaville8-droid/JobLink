import { type AnchorHTMLAttributes } from 'react';
export const JOB_ID = '22222222-2222-4222-8222-222222222222';
export const fixtureJob = {
  id: JOB_ID, company_id: 'fixture-company', title: 'Kitchen Staff — synthetic QA vacancy',
  description: Array.from({ length: 24 }, (_, index) => `Fixture section ${index + 1}: This synthetic vacancy exercises the actual job detail layout during scrolling. No real employer, job, salary, application deadline or hiring permission is represented.`).join('\n\n'),
  location: '   ', status: 'active', job_type: 'full_time', salary_visible: false,
  created_at: '2026-10-01T12:00:00Z', posted_by_admin: true, expires_at: null,
  company: { id: 'fixture-company', company_name: 'Synthetic QA Company', logo_url: null, description: 'Browser test fixture only.', industry: 'Food & Beverage', location: 'Company HQ — not the work location', website: null, is_verified: false },
};
export function createClient() {
  const builder = { select: () => builder, eq: () => builder, single: async () => ({ data: fixtureJob, error: null }) };
  return { from: () => builder, auth: {
    getUser: async () => ({ data: { user: null } }),
    signInWithOAuth: async (options: unknown) => { (window as Window & { fixtureOAuth?: unknown }).fixtureOAuth = options; return { error: null }; },
  } };
}
export const useAuth = () => ({ isAuthenticated: false, userRole: null, isLoading: false, isEmailVerified: false });
export const usePathname = () => window.location.pathname;
export const useSearchParams = () => new URLSearchParams(window.location.search);
export const useSelectedLayoutSegment = () => 'jobs';
export const useRouter = () => ({ push: (url: string) => { window.location.href = url; }, prefetch: () => {}, refresh: () => {} });
export function notFound(): never { throw new Error('Synthetic fixture: not found'); }
export default function Link({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) { return <a href={href} {...props}>{children}</a>; }
