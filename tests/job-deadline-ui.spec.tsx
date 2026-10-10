import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
  rpc: async () => ({ data: 0 }),
  from(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    const execute = () => {
      const rows = (db.tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
      return { data: rows, count: rows.length, error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      order: () => query, limit: () => query, range: () => query,
      single: async () => ({ ...execute(), data: execute().data[0] ?? null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return query;
  },
}) }));
vi.mock('@/lib/auth', () => ({ requireAuth: async () => ({ id: 'owner' }) }));
vi.mock('@/lib/job-alert-matcher', () => ({ processJobAlerts: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('Redirect'); } }));
vi.mock('@/components/AdminBentoDashboard', () => ({ default: () => null }));
vi.mock('@/components/cv/DashboardNudge', () => ({ default: () => null }));
vi.mock('@/components/DeleteListingButton', () => ({ default: () => null }));
vi.mock('@/app/(dashboard)/saved/UnsaveButton', () => ({ default: () => null }));
vi.mock('@/components/Pagination', () => ({ default: () => null }));

import DashboardPage from '@/app/(dashboard)/dashboard/page';
import MyListingsPage from '@/app/(dashboard)/my-listings/page';
import SavedJobsPage from '@/app/(dashboard)/saved/page';
import { TemplateSender } from '@/components/AdminEmailSender';

beforeEach(() => {
  const job = {
    id: 'job', company_id: 'company', title: 'Cook', status: 'active',
    description: 'Application deadline: October 3, 2026. Work Saturdays only. Email jobs@example.com to apply.',
    created_at: '2026-09-01T12:00:00Z', expires_at: new Date(Date.now() + 86400000).toISOString(),
    job_type: 'part_time', location: 'Antigua', applications: [{ count: 0 }],
  };
  db.tables = {
    users: [{ id: 'owner', role: 'employer' }],
    companies: [{ id: 'company', user_id: 'owner', company_name: 'Test Company' }],
    seeker_profiles: [{ id: 'profile', user_id: 'owner' }],
    job_listings: [job],
    saved_jobs: [{ id: 'saved', seeker_id: 'profile', job_listings: job }],
    applications: [],
  };
});

it('shows active employer listings and posted dates without countdowns or expiry warnings', async () => {
  const before = structuredClone(db.tables);
  const page = await DashboardPage();
  const employerDashboard = page.type as (props: Record<string, unknown>) => Promise<ReactElement>;
  const html = renderToStaticMarkup(await employerDashboard(page.props));
  expect(html).toContain('Cook');
  expect(html).toContain('Posted');
  expect(html).not.toMatch(/Expires|expiring soon|\d+d left/);
  expect(db.tables).toEqual(before);
});

it('keeps posted dates and manual-close controls in My Listings without an expiry label', async () => {
  const before = structuredClone(db.tables);
  const html = renderToStaticMarkup(await MyListingsPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('Cook');
  expect(html).toContain('Posted');
  expect(html).toContain('Close Listing');
  expect(html).not.toContain('Expires');
  expect(db.tables).toEqual(before);
});

it('builds saved-job snippets from visible text before truncation without rewriting the saved record', async () => {
  const before = structuredClone(db.tables);
  const html = renderToStaticMarkup(await SavedJobsPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('Work Saturdays only. Email jobs@example.com to apply.');
  expect(html).not.toContain('Application deadline');
  expect(html).not.toContain('October 3, 2026');
  expect(db.tables).toEqual(before);
});

it('removes only the obsolete job-expiry email option, keeping other templates', () => {
  const html = renderToStaticMarkup(<TemplateSender />);
  expect(html).not.toContain('Listing Expiry Warning');
  expect(html).not.toContain('listing_expiry');
  expect(html).toContain('Listing Approved');
  expect(html).toContain('Signup Reminder (Final)');
});
