import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

// Exercise eligibility filters against mixed active/closed fixtures, rather
// than returning the same canned data regardless of eligibility conditions.
function client() {
  return {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let bounds = [0, Infinity];
      const execute = () => {
        const rows = db.tables[table].filter(row => filters.every(filter => filter(row)));
        return { data: rows.slice(bounds[0], bounds[1] + 1), count: rows.length, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push(row => key === 'job_listings.status'
            ? db.tables.job_listings.some(job => job.company_id === row.id && job.status === value)
            : row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
        or: (expression: string, options?: { referencedTable?: string }) => {
          if (expression.includes('expires_at')) {
            const beforeDeadline = (row: Row) => !row.expires_at || new Date(String(row.expires_at)).getTime() > Date.now();
            filters.push(row => options?.referencedTable === 'job_listings'
              ? db.tables.job_listings.some(job => job.company_id === row.id && beforeDeadline(job))
              : beforeDeadline(row));
          }
          return query;
        },
        ilike: () => query,
        order: () => query,
        limit: (count: number) => { bounds = [0, count - 1]; return query; },
        range: (start: number, end: number) => { bounds = [start, end]; return query; },
        single: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
  };
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client() }));
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'employer' } }) }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('Not found'); },
  useSearchParams: () => new URLSearchParams('invite=true'),
}));
vi.mock('@/components/home/HomePage', () => ({
  default: ({ jobs, stats }: { jobs: Row[]; stats: Row }) => <div>{JSON.stringify({ jobs, stats })}</div>,
}));
vi.mock('@/components/JobCard', () => ({ default: ({ job }: { job: Row }) => <div>{String(job.title)}</div> }));
vi.mock('@/components/Pagination', () => ({ default: () => null }));
vi.mock('@/components/AlertToggle', () => ({ default: () => null }));
vi.mock('@/components/JobFilters', () => ({ default: () => null }));
vi.mock('@/components/JobSearchBar', () => ({ default: () => null }));

import Home from '@/app/page';
import JobResults from '@/components/JobResults';
import JobIndustryShortcuts from '@/components/JobIndustryShortcuts';
import InviteToApplyButton from '@/components/InviteToApplyButton';
import { generateMetadata as categoryMetadata } from '@/app/jobs/page';
import CompanyPage, { generateMetadata as companyMetadata } from '@/app/companies/[id]/page';
import sitemap from '@/app/sitemap';

beforeEach(() => {
  db.tables = { job_listings: [], companies: [], users: [], applications: [] };
  for (const status of ['active', 'closed', 'pending_approval', 'expired']) {
    const company = { id: `company-${status}`, company_name: `Company ${status}`, user_id: 'employer', created_at: '2020-01-01' };
    db.tables.companies.push(company);
    db.tables.job_listings.push({
      id: `job-${status}`, title: `${status} legacy role`, status,
      category: 'Accounting', job_type: 'full_time', company_id: company.id, company,
      expires_at: '2020-02-01T00:00:00Z', created_at: '2020-01-01',
    });
  }
});
afterEach(cleanup);

it.each([{}, { q: 'legacy' }, { category: 'Accounting' }])('includes only active legacy jobs in browse/search results: %j', async (searchParams) => {
  const before = structuredClone(db.tables);
  const html = renderToStaticMarkup(await JobResults({ searchParams }));
  expect(html).toContain('active legacy role');
  for (const status of ['closed', 'pending_approval', 'expired']) expect(html).not.toContain(`${status} legacy role`);
  expect(db.tables).toEqual(before);
});

it('includes past-deadline active listings in featured jobs and both homepage counts', async () => {
  const before = structuredClone(db.tables);
  const output = await Home();
  // HomePage receives the real query results before client rendering.
  const { props } = output.props.children[1];
  expect(props.jobs.map((job: Row) => job.id)).toEqual(['job-active']);
  expect(props.stats).toMatchObject({ jobs: 1, employers: 1 });
  expect(db.tables).toEqual(before);
});

it('keeps category metadata indexable and its shortcut count accurate for legacy active jobs', async () => {
  const metadata = await categoryMetadata({ searchParams: Promise.resolve({ category: 'Accounting' }) });
  expect(metadata.robots).toBeUndefined();
  expect(metadata.description).toContain('1 open Accounting job');
  const html = renderToStaticMarkup(await JobIndustryShortcuts());
  expect(html).toContain('Accounting');
  expect(html).toContain('1 open job');
});

it('keeps company jobs and metadata available while excluding manually unavailable listings', async () => {
  for (const status of ['active', 'closed', 'pending_approval', 'expired']) {
    const params = Promise.resolve({ id: `company-${status}` });
    const metadata = await companyMetadata({ params });
    const html = renderToStaticMarkup(await CompanyPage({ params }));
    if (status === 'active') {
      expect(metadata.robots).toBeUndefined();
      expect(metadata.description).toContain('1 open job');
      expect(html).toContain('active legacy role');
    } else {
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(html).not.toContain(`${status} legacy role`);
    }
  }
});

it('lists active legacy jobs and their companies in the sitemap without changing listing state', async () => {
  const before = structuredClone(db.tables);
  const urls = (await sitemap()).map(entry => entry.url);
  expect(urls).toContain('https://joblinkantigua.com/jobs/job-active');
  expect(urls).toContain('https://joblinkantigua.com/companies/company-active');
  for (const status of ['closed', 'pending_approval', 'expired']) {
    expect(urls).not.toContain(`https://joblinkantigua.com/jobs/job-${status}`);
    expect(urls).not.toContain(`https://joblinkantigua.com/companies/company-${status}`);
  }
  expect(db.tables).toEqual(before);
});

it('offers active legacy jobs in the invitation selector, excluding other statuses', async () => {
  // All statuses belong to this employer so the status filter does the excluding.
  for (const job of db.tables.job_listings) job.company_id = 'company-active';
  const before = structuredClone(db.tables);
  render(<InviteToApplyButton candidateName="Test Candidate" candidateUserId="candidate" />);
  await waitFor(() => expect(screen.getByRole('option', { name: 'active legacy role' })).toBeDefined());
  for (const status of ['closed', 'pending_approval', 'expired']) {
    expect(screen.queryByRole('option', { name: `${status} legacy role` })).toBeNull();
  }
  expect(db.tables).toEqual(before);
});
