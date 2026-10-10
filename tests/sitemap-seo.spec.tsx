import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INDUSTRIES } from '@/lib/types';

type Row = Record<string, string | null>;
type Query = {
  table: string;
  selection?: string;
  filters: [string, string][];
  expiryFilter?: string;
  ids?: string[];
  order?: [string, { ascending: boolean }];
  range?: [number, number];
};

const db = vi.hoisted(() => ({
  rows: { job_listings: [], companies: [] } as Record<string, Row[]>,
  queries: [] as Query[],
  errors: {} as Record<string, Error>,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const request: Query = { table, filters: [] };
      db.queries.push(request);
      const query = {
        select: (selection: string) => { request.selection = selection; return query; },
        eq: (column: string, value: string) => { request.filters.push([column, value]); return query; },
        or: (filter: string) => { request.expiryFilter = filter; return query; },
        in: (column: string, ids: string[]) => {
          expect(column).toBe('id');
          request.ids = ids;
          return query;
        },
        order: (column: string, options: { ascending: boolean }) => {
          request.order = [column, options];
          return query;
        },
        range: (start: number, end: number) => { request.range = [start, end]; return query; },
        then: (resolve: (result: { data: Row[] | null; error: Error | null }) => unknown) => {
          const error = db.errors[`${table}:${request.range?.[0] ?? 0}`];
          if (error) return Promise.resolve(resolve({ data: null, error }));
          let data = [...db.rows[table]];
          for (const [column, value] of request.filters) data = data.filter(row => row[column] === value);
          if (request.expiryFilter) {
            const prefix = 'expires_at.is.null,expires_at.gt.';
            expect(request.expiryFilter.startsWith(prefix)).toBe(true);
            const now = Date.parse(request.expiryFilter.slice(prefix.length));
            data = data.filter(row => row.expires_at === null || Date.parse(row.expires_at!) > now);
          }
          if (request.ids) data = data.filter(row => request.ids!.includes(row.id!));
          if (request.order) {
            const [column, { ascending }] = request.order;
            data.sort((a, b) => (a[column] ?? '').localeCompare(b[column] ?? '') * (ascending ? 1 : -1));
          }
          if (request.range) data = data.slice(request.range[0], request.range[1] + 1);
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return query;
    },
  }),
}));

import sitemap from '@/app/sitemap';

const BASE_URL = 'https://joblinkantigua.com';
const NOW = '2026-10-10T04:00:00.000Z';
function job(id: string, category: string | null, overrides: Row = {}): Row {
  return { id, category, company_id: 'company-a', created_at: '2020-01-01T00:00:00.000Z', status: 'active', expires_at: null, ...overrides };
}
function categoryUrls(entries: Awaited<ReturnType<typeof sitemap>>) {
  return entries.filter(entry => entry.url.includes('?')).map(entry => entry.url);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  db.rows = {
    job_listings: [],
    companies: [{ id: 'company-a', created_at: '2019-01-01T00:00:00.000Z' }],
  };
  db.queries = [];
  db.errors = {};
});
afterEach(() => vi.useRealTimers());

describe('canonical sitemap SEO', () => {
  it('includes every populated industry, including all categories beyond the six homepage shortcuts', async () => {
    db.rows.job_listings = INDUSTRIES.map((category, index) => job(`job-${index}`, category));
    const entries = await sitemap();
    expect(INDUSTRIES.length).toBeGreaterThan(7);
    expect(categoryUrls(entries)).toEqual(INDUSTRIES.map(category => `${BASE_URL}/jobs?category=${encodeURIComponent(category)}`));
    expect(categoryUrls(entries)).toContain(`${BASE_URL}/jobs?category=Food%20%26%20Beverage`);
    expect(categoryUrls(entries)).toContain(`${BASE_URL}/jobs?category=Tourism%20%26%20Hospitality`);
    for (const entry of entries) {
      const params = new URL(entry.url).searchParams;
      expect([...params.keys()]).toEqual(params.size ? ['category'] : []);
    }
  });

  it('deduplicates category, job and hiring-company URLs', async () => {
    db.rows.job_listings = [job('first', 'Accounting'), job('second', 'Accounting'), job('first', 'Accounting')];
    db.rows.companies.push({ ...db.rows.companies[0] });
    const entries = await sitemap();
    const urls = entries.map(entry => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(categoryUrls(entries)).toEqual([`${BASE_URL}/jobs?category=Accounting`]);
    expect(urls.filter(url => url.includes('/companies/'))).toEqual([`${BASE_URL}/companies/company-a`]);
  });

  it('excludes unknown, empty and noncanonical stored categories that canonical page queries would not match', async () => {
    db.rows.job_listings = [
      job('canonical', 'Food & Beverage'),
      job('unknown', 'Unlisted industry'),
      job('empty', ''),
      job('null', null),
      job('case-only', 'accounting'),
      job('spaces', ' Accounting '),
      job('injected-filter', 'Technology&q=manager'),
    ];
    expect(categoryUrls(await sitemap())).toEqual([`${BASE_URL}/jobs?category=Food%20%26%20Beverage`]);
  });

  it('uses status alone for eligibility, retaining active jobs despite old creation or legacy expiry dates', async () => {
    db.rows.job_listings = [
      job('old-still-open', 'Accounting'),
      job('future-expiry', 'Technology', { expires_at: '2027-01-01T00:00:00.000Z' }),
      job('closed', 'Education', { status: 'closed', company_id: 'not-hiring' }),
      job('pending', 'Legal', { status: 'pending', company_id: 'not-hiring' }),
      job('expired-status', 'Government & Civil Service', { status: 'expired', company_id: 'not-hiring' }),
      job('past-legacy-expiry', 'Healthcare', { expires_at: '2020-01-01T00:00:00.000Z', company_id: 'legacy-hiring' }),
      job('legacy-expiry-now', 'Construction', { expires_at: NOW, company_id: 'legacy-hiring' }),
    ];
    db.rows.companies.push({ id: 'not-hiring' }, { id: 'legacy-hiring' });
    const entries = await sitemap();
    expect(entries.filter(entry => entry.url.includes('/jobs/')).map(entry => entry.url)).toEqual([
      `${BASE_URL}/jobs/future-expiry`, `${BASE_URL}/jobs/legacy-expiry-now`,
      `${BASE_URL}/jobs/old-still-open`, `${BASE_URL}/jobs/past-legacy-expiry`,
    ]);
    expect(categoryUrls(entries)).toEqual([
      `${BASE_URL}/jobs?category=Construction`, `${BASE_URL}/jobs?category=Healthcare`,
      `${BASE_URL}/jobs?category=Technology`, `${BASE_URL}/jobs?category=Accounting`,
    ]);
    expect(entries.filter(entry => entry.url.includes('/companies/')).map(entry => entry.url)).toEqual([
      `${BASE_URL}/companies/company-a`, `${BASE_URL}/companies/legacy-hiring`,
    ]);
    for (const query of db.queries.filter(query => query.table === 'job_listings')) {
      expect(query.filters).toEqual([['status', 'active']]);
      expect(query.expiryFilter).toBeUndefined();
    }
  });

  it('includes categories and listings found after the Data API first page', async () => {
    db.rows.job_listings = Array.from({ length: 1000 }, (_, index) => job(`a-${String(index).padStart(4, '0')}`, 'Accounting'));
    db.rows.job_listings.push(job('z-later-page', 'Food & Beverage', { expires_at: '2020-01-01T00:00:00.000Z' }));
    const entries = await sitemap();
    expect(categoryUrls(entries)).toEqual([`${BASE_URL}/jobs?category=Food%20%26%20Beverage`, `${BASE_URL}/jobs?category=Accounting`]);
    expect(entries.some(entry => entry.url === `${BASE_URL}/jobs/z-later-page`)).toBe(true);
    const queries = db.queries.filter(query => query.table === 'job_listings');
    expect(queries.map(query => query.range)).toEqual([[0, 999], [1000, 1999]]);
    expect(queries.every(query => query.order?.[0] === 'id' && query.order[1].ascending)).toBe(true);
    expect(queries.every(query => query.expiryFilter === undefined)).toBe(true);
  });

  it('finishes an exactly full page and keeps company requests bounded and complete', async () => {
    db.rows.job_listings = Array.from({ length: 1000 }, (_, index) => job(`job-${index}`, 'Accounting', { company_id: `company-${index}` }));
    db.rows.companies = db.rows.job_listings.map(row => ({ id: row.company_id }));
    const entries = await sitemap();
    expect(entries.filter(entry => entry.url.includes('/companies/'))).toHaveLength(1000);
    expect(db.queries.filter(query => query.table === 'job_listings').map(query => query.range)).toEqual([[0, 999], [1000, 1999]]);
    const companyQueries = db.queries.filter(query => query.table === 'companies');
    expect(companyQueries).toHaveLength(10);
    expect(companyQueries.every(query => query.ids?.length === 100)).toBe(true);
  });

  it('omits unavailable company profiles and does not fetch companies without active jobs', async () => {
    db.rows.job_listings = [job('job', 'Accounting', { company_id: 'unavailable' })];
    expect((await sitemap()).filter(entry => entry.url.includes('/companies/'))).toEqual([]);
    db.rows.job_listings = [];
    db.queries = [];
    const entries = await sitemap();
    expect(entries).toHaveLength(7);
    expect(categoryUrls(entries)).toEqual([]);
    expect(db.queries.some(query => query.table === 'companies')).toBe(false);
  });

  it('never fabricates lastmod from generation time or record creation dates', async () => {
    db.rows.job_listings = [job('job', 'Accounting', { expires_at: '2026-10-10T23:00:00.000Z' })];
    const first = await sitemap();
    vi.setSystemTime(new Date('2026-10-11T04:00:00.000Z'));
    const later = await sitemap();
    expect(later).toEqual(first);
    expect(first.every(entry => !Object.hasOwn(entry, 'lastModified'))).toBe(true);
    expect(db.queries.every(query => !query.selection?.includes('created_at'))).toBe(true);
  });

  it.each(['job_listings', 'companies'])('fails rather than returning a partial sitemap on a %s read error', async table => {
    db.rows.job_listings = [job('job', 'Accounting')];
    db.errors[`${table}:0`] = new Error('Synthetic database outage');
    await expect(sitemap()).rejects.toThrow(table === 'job_listings' ? 'Unable to load live jobs for sitemap' : 'Unable to load hiring companies for sitemap');
  });

  it('fails rather than silently dropping categories when a later jobs page fails', async () => {
    db.rows.job_listings = Array.from({ length: 1000 }, (_, index) => job(`job-${index}`, 'Accounting'));
    db.errors['job_listings:1000'] = new Error('Synthetic later-page outage');
    await expect(sitemap()).rejects.toThrow('Unable to load live jobs for sitemap');
  });
});
