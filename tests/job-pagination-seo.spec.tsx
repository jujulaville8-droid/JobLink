import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fixture = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  error: null as { code: string; message: string } | null,
  emptyRange: false,
  queries: [] as { from: number; to: number; calls: [string, ...unknown[]][] }[],
  from: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: fixture.from.mockImplementation(() => {
      const entry = { from: 0, to: 11, calls: [] as [string, ...unknown[]][] };
      fixture.queries.push(entry);
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      let head = false;
      const query = {
        select: (fields: string, options?: { head?: boolean }) => {
          entry.calls.push(['select', fields, options]);
          head = options?.head ?? false;
          return query;
        },
        eq: (field: string, value: unknown) => {
          entry.calls.push(['eq', field, value]);
          filters.push(row => row[field] === value);
          return query;
        },
        in: (field: string, values: unknown[]) => {
          entry.calls.push(['in', field, values]);
          filters.push(row => values.includes(row[field]));
          return query;
        },
        ilike: (field: string, value: string) => {
          entry.calls.push(['ilike', field, value]);
          if (field === 'location') filters.push(row => String(row[field]).includes(value.slice(1, -1)));
          return query;
        },
        or: (value: string) => { entry.calls.push(['or', value]); return query; },
        order: (field: string, options: unknown) => { entry.calls.push(['order', field, options]); return query; },
        range: (from: number, to: number) => { entry.from = from; entry.to = to; return query; },
        then: (resolve: (result: unknown) => unknown) => {
          const rows = fixture.rows.filter(row => filters.every(filter => filter(row)));
          const error = fixture.error ?? (!head && entry.from > 0 && entry.from >= rows.length && !fixture.emptyRange
            ? { code: 'PGRST103', message: 'Requested range not satisfiable' } : null);
          return Promise.resolve(resolve({
            data: error || head ? null : rows.slice(entry.from, entry.to + 1),
            count: error ? null : rows.length,
            error,
          }));
        },
      };
      return query;
    }),
  }),
}));
vi.mock('next/navigation', () => ({ notFound: fixture.notFound }));
vi.mock('@/components/JobCard', () => ({ default: ({ job }: { job: { title: string } }) => <article>{job.title}</article> }));
vi.mock('@/components/AlertToggle', () => ({ default: () => null }));
vi.mock('@/components/JobFilters', () => ({ default: () => null }));
vi.mock('@/components/JobSearchBar', () => ({ default: () => null }));
vi.mock('@/components/JobIndustryShortcuts', () => ({ default: () => null }));
vi.mock('@/components/Pagination', () => ({ default: ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => <nav>{currentPage}/{totalPages}</nav> }));

import JobsPage, { generateMetadata } from '@/app/jobs/page';
import JobResults from '@/components/JobResults';
import JobsNotFound, { metadata as notFoundMetadata } from '@/app/jobs/not-found';
import RootNotFound from '@/app/not-found';
import { getJobResults, isJobPageOutOfRange, parseJobPage, type JobSearchParams } from '@/lib/job-results';

function jobs(count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `job-${index}`, title: `Cashier ${index + 1}`, status: 'active',
    category: 'Retail & Trade', location: 'Antigua', job_type: 'full_time',
    company: { id: 'company', company_name: 'Retail employer' },
    ...overrides,
  }));
}
function props(params: JobSearchParams) { return { searchParams: Promise.resolve(params) }; }
function findResults(node: ReactNode): Parameters<typeof JobResults>[0] | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === JobResults) return child.props as Parameters<typeof JobResults>[0];
    const match = findResults(child.props.children);
    if (match) return match;
  }
}

beforeEach(() => {
  fixture.rows = jobs(13);
  fixture.error = null;
  fixture.emptyRange = false;
  fixture.queries = [];
  fixture.from.mockClear();
  fixture.notFound.mockClear();
});

describe('public job pagination validation', () => {
  it('clears the inherited canonical even when Next resolves fallback metadata instead of the page', () => {
    expect(notFoundMetadata.alternates?.canonical).toBeNull();
    expect(notFoundMetadata.robots).toEqual({ index: false, follow: true });
    expect(JobsNotFound).toBe(RootNotFound);
  });

  it.each([undefined, '1', '2', '150'])('accepts a positive decimal page: %s', value => {
    expect(parseJobPage(value)).toBe(value === undefined ? 1 : Number(value));
  });

  it.each(['', '0', '-1', '1.5', '2oops', ' 2', '2 ', '+2', '01', '1e2', 'Infinity', 'NaN', '9'.repeat(400), '9007199254740991', ['2', '3']])(
    'rejects malformed or unsafe input before querying: %j', async page => {
      expect(parseJobPage(page)).toBeNull();
      const metadata = await generateMetadata(props({ page }));
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(metadata.alternates?.canonical).toBeNull();
      await expect(JobsPage(props({ page }))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
      expect(fixture.from).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])('rejects page two of 12 matching jobs, with an empty-range response: %s', async emptyRange => {
    fixture.emptyRange = emptyRange;
    fixture.rows = [
      ...jobs(12), ...jobs(4, { status: 'closed' }), ...jobs(5, { category: 'Accounting' }),
    ];
    const params = { category: ' retail & trade ', page: '2' };
    const metadata = await generateMetadata(props(params));
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBeNull();
    await expect(JobsPage(props(params))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(fixture.queries.every(query => query.from === 12 && query.to === 23)).toBe(true);
  });

  it('renders the thirteenth matching job, with the same prefetched count and no second card query', async () => {
    fixture.rows.push(...jobs(2, { status: 'closed' }), ...jobs(3, { category: 'Accounting' }));
    const resultProps = findResults(await JobsPage(props({ category: 'RETAIL & TRADE', page: '2' })));
    expect(resultProps?.prefetchedResults?.count).toBe(13);
    expect(resultProps?.prefetchedResults?.jobs?.length).toBe(1);
    const callsBeforeCards = fixture.from.mock.calls.length;
    const html = renderToStaticMarkup(await JobResults(resultProps!));
    expect(fixture.from).toHaveBeenCalledTimes(callsBeforeCards);
    expect(html).toContain('Cashier 13');
    expect(html).toContain('Retail &amp; Trade');
    expect(html).toContain('2/2');
    expect(fixture.notFound).not.toHaveBeenCalled();
  });

  it.each([{}, { category: 'Retail & Trade' }])('self-canonicalizes a real second page: %j', async filters => {
    const metadata = await generateMetadata(props({ ...filters, page: '2' }));
    const expected = filters.category
      ? 'https://joblinkantigua.com/jobs?category=Retail%20%26%20Trade&page=2'
      : 'https://joblinkantigua.com/jobs?page=2';
    expect(metadata.alternates?.canonical).toBe(expected);
    expect(metadata.openGraph?.url).toBe(expected);
    expect(metadata.robots).toBeUndefined();
  });

  it.each([{}, { page: '1' }])('preserves first-page category metadata and empty state: %j', async pagination => {
    fixture.rows = [];
    const params = { category: 'Retail & Trade', ...pagination };
    const metadata = await generateMetadata(props(params));
    expect(metadata.alternates?.canonical).toBe('https://joblinkantigua.com/jobs?category=Retail%20%26%20Trade');
    expect(metadata.robots).toEqual({ index: false, follow: true });
    fixture.from.mockClear();
    const resultProps = findResults(await JobsPage(props(params)));
    expect(fixture.from).not.toHaveBeenCalled();
    expect(resultProps?.prefetchedResults).toBeUndefined();
    expect(renderToStaticMarkup(await JobResults(resultProps!))).toContain('No retail &amp; trade jobs right now');
    expect(fixture.notFound).not.toHaveBeenCalled();
  });

  it('retains noindex and the existing canonical for a real filtered page', async () => {
    const metadata = await generateMetadata(props({ category: 'Retail & Trade', job_type: ['full_time'], page: '2' }));
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe('https://joblinkantigua.com/jobs');
  });

  it('validates against the full category/location/job-type filter, not unrelated jobs', async () => {
    fixture.rows = [
      ...jobs(12), ...jobs(10, { job_type: 'part_time' }), ...jobs(10, { location: 'Barbuda' }),
    ];
    await expect(JobsPage(props({ category: 'Retail & Trade', location: 'Antigua', job_type: 'full_time', page: '2' })))
      .rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('preserves escaped keyword/company search and every filter in the shared query', async () => {
    await getJobResults({ q: 'Cashier, 100%', category: 'retail & trade', location: 'Antigua', job_type: ['full_time', 'part_time'] }, 2);
    const calls = fixture.queries[0].calls;
    expect(calls).toContainEqual(['eq', 'status', 'active']);
    expect(calls).toContainEqual(['eq', 'category', 'Retail & Trade']);
    expect(calls).toContainEqual(['ilike', 'location', '%Antigua%']);
    expect(calls).toContainEqual(['in', 'job_type', ['full_time', 'part_time']]);
    expect(calls.find(([method]) => method === 'or')?.[1]).toBe('title.ilike."%Cashier, 100\\\\%%",description.ilike."%Cashier, 100\\\\%%",company_search.not.is.null');
    expect(calls).toContainEqual(['ilike', 'company_search.company_name', '%Cashier, 100\\%%']);
  });

  it('does not widen an unknown category when determining whether a page exists', async () => {
    await expect(JobsPage(props({ category: 'Unlisted category', page: '2' }))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(fixture.queries[0].calls).toContainEqual(['eq', 'category', 'Unlisted category']);
  });

  it('keeps genuine backend errors nonindexable without mislabeling them as missing pages', async () => {
    fixture.error = { code: '08006', message: 'Connection failed' };
    const params = { category: 'Retail & Trade', page: '2' };
    const metadata = await generateMetadata(props(params));
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBeNull();
    expect(isJobPageOutOfRange(await getJobResults(params, 2))).toBe(false);
    await expect(JobsPage(props(params))).rejects.toThrow('Unable to load the requested jobs page');
    expect(fixture.notFound).not.toHaveBeenCalled();
  });
});
