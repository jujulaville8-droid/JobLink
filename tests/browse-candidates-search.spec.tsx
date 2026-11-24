import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';

const mocks = vi.hoisted(() => ({ session: vi.fn(), admin: vi.fn(), requireRole: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/components/CandidateFilters', () => ({ default: () => null }));
vi.mock('@/components/ui/info-card', () => ({ default: ({ name }: { name: string }) => <div>{name}</div> }));
import BrowseCandidatesPage from '@/app/(dashboard)/browse-candidates/page';

const profiles = [
  { id: 'p1', user_id: 'u1', first_name: 'Alice', last_name: 'One', location: 'Antigua', skills: ['Cooking'] },
  { id: 'p2', user_id: 'u2', first_name: 'Bob', last_name: 'Two', has_drivers_licence: true, skills: ['Driving'] },
];
const cvRows = [{ id: 'cv1', user_id: 'u1', job_title: 'Chef', summary: 'Private CV text' }];
function query(data: unknown, error: unknown = null) {
  const result = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  };
  return result;
}
let sessionQuery: ReturnType<typeof query>;
let cvQuery: ReturnType<typeof query>;
let workQuery: ReturnType<typeof query>;
let skillsQuery: ReturnType<typeof query>;
let adminFrom: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  sessionQuery = query(profiles);
  cvQuery = query(cvRows);
  workQuery = query([{ cv_profile_id: 'cv1', job_title: 'Cook', company_name: 'Resort' }]);
  skillsQuery = query([{ cv_profile_id: 'cv1', name: 'Pastry' }]);
  mocks.session.mockResolvedValue({ from: vi.fn().mockReturnValue(sessionQuery) });
  adminFrom = vi.fn((table: string) => ({
    cv_profiles: cvQuery, cv_work_experiences: workQuery, cv_skills: skillsQuery,
  })[table]);
  mocks.admin.mockReturnValue({ from: adminFrom });
});
afterEach(cleanup);

// Resolve the nested server component without changing the page's public exports.
async function resolveResults(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = await resolveResults(child);
      if (result) return result;
    }
  }
  if (isValidElement<{ children?: ReactNode; searchParams?: { q?: string } }>(node)) {
    if (typeof node.type === 'function' && node.props.searchParams) {
      const props = node.props;
      const component = node.type as (input: typeof props) => Promise<ReactNode>;
      return component(props);
    }
    return resolveResults(node.props.children);
  }
  return null;
}
async function show(params: { q?: string; skills?: string; min_exp?: string; max_exp?: string }) {
  const page = await BrowseCandidatesPage({ searchParams: Promise.resolve(params) });
  render(await resolveResults(page));
}

describe('candidate keyword query integration', () => {
  it('scopes bulk CV queries to session results and preserves gates and ordering', async () => {
    await show({ q: 'chef Antigua resort pastry', min_exp: '2', max_exp: '10' });
    expect(screen.getByText('Alice One')).toBeTruthy();
    expect(screen.queryByText('Bob Two')).toBeNull();
    expect(screen.queryByText('Private CV text')).toBeNull();
    expect(mocks.requireRole).toHaveBeenCalledWith('employer');
    expect(sessionQuery.eq).toHaveBeenCalledWith('visibility', 'actively_looking');
    expect(sessionQuery.gte).toHaveBeenCalledWith('profile_complete_pct', 30);
    for (const field of ['first_name', 'last_name']) {
      expect(sessionQuery.not).toHaveBeenCalledWith(field, 'is', null);
      expect(sessionQuery.neq).toHaveBeenCalledWith(field, '');
    }
    expect(sessionQuery.gte).toHaveBeenCalledWith('experience_years', 2);
    expect(sessionQuery.lte).toHaveBeenCalledWith('experience_years', 10);
    expect(sessionQuery.order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(adminFrom.mock.calls.map(([table]) => table)).toEqual(['cv_profiles', 'cv_work_experiences', 'cv_skills']);
    expect(cvQuery.select).toHaveBeenCalledWith('user_id, id, job_title, summary');
    expect(cvQuery.in).toHaveBeenCalledWith('user_id', ['u1', 'u2']);
    expect(workQuery.select).toHaveBeenCalledWith('cv_profile_id, job_title, company_name');
    expect(skillsQuery.select).toHaveBeenCalledWith('cv_profile_id, name');
    expect(workQuery.in).toHaveBeenCalledWith('cv_profile_id', ['cv1']);
    expect(skillsQuery.in).toHaveBeenCalledWith('cv_profile_id', ['cv1']);
  });

  it.each(['admin throws', 'cv error', 'work error', 'skills error', 'query throws'])(
    'falls back to profile fields when %s', async (failure) => {
      if (failure === 'admin throws') mocks.admin.mockImplementation(() => { throw new Error('Unavailable'); });
      if (failure === 'cv error') cvQuery = query(null, { message: 'Unavailable' });
      if (failure === 'work error') workQuery = query(null, { message: 'Unavailable' });
      if (failure === 'skills error') skillsQuery = query(null, { message: 'Unavailable' });
      if (failure === 'query throws') cvQuery.in.mockRejectedValue(new Error('Unavailable'));
      await show({ q: 'driver' });
      expect(screen.getByText('Bob Two')).toBeTruthy();
      expect(screen.queryByText('Alice One')).toBeNull();
      expect(screen.queryByText(/Something went wrong/)).toBeNull();
    },
  );

  it('discards partial CV results on child lookup failure', async () => {
    skillsQuery = query(null, { message: 'Unavailable' });
    await show({ q: 'chef' });
    expect(screen.getByText('No candidates found')).toBeTruthy();
  });

  it.each([undefined, '  ... !!! '])('skips admin reads for empty tokens: %s', async (q) => {
    await show({ q });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(screen.getByText('Alice One')).toBeTruthy();
    expect(screen.getByText('Bob Two')).toBeTruthy();
  });

  it('skips admin reads when no profiles are eligible', async () => {
    sessionQuery = query([]);
    mocks.session.mockResolvedValue({ from: vi.fn().mockReturnValue(sessionQuery) });
    await show({ q: 'chef' });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('skips child lookups when no CV profiles exist', async () => {
    cvQuery = query([]);
    await show({ q: 'driver' });
    expect(screen.getByText('Bob Two')).toBeTruthy();
    expect(adminFrom).toHaveBeenCalledTimes(1);
  });

  it('retains the existing skills filter after keyword matching', async () => {
    await show({ q: 'chef', skills: 'driving' });
    expect(screen.getByText('No candidates found')).toBeTruthy();
  });
});
