import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import EmployersPage from '@/app/employers/page';
import MyListingsPage from '@/app/(dashboard)/my-listings/page';
vi.mock('@/lib/auth', () => ({ requireAuth: async () => ({ id: 'owner' }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: (table: string) => {
  const q = { select: () => q, eq: () => q, order: () => q, single: async () => ({ data: { id: 'company' } }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'job_listings' ? [{ id: 'draft-one', title: 'Chef', status: 'draft', job_type: 'full_time', created_at: '2026-10-26', applications: [] }] : [], error: null }).then(resolve),
  }; return q;
} }) }));
vi.mock('@/components/DeleteListingButton', () => ({ default: () => <button>Delete</button> }));
vi.mock('@/lib/job-alert-matcher', () => ({ processJobAlerts: vi.fn() }));
vi.mock('@/lib/close-job-listing', () => ({ closeJobListing: vi.fn() }));
afterEach(cleanup);
it('offers public employer posting and signup with the three how-it-works cards and no monetization', () => {
  render(<EmployersPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Find your next great hire');
  expect(screen.getByRole('link', { name: 'Post a job for free' }).getAttribute('href')).toBe('/post-job');
  expect(screen.getByRole('link', { name: 'Create an employer account' }).getAttribute('href')).toBe('/signup?role=employer');
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(document.body.textContent).not.toMatch(/sponsor|upgrade|pricing|premium/i);
  expect(readFileSync('src/lib/supabase/middleware.ts', 'utf8')).toContain("pathname === '/employers'");
});
it('surfaces drafts on My Listings with a resume link and no applicant actions', async () => {
  render(await MyListingsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('Draft', { exact: true })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Resume draft' }).getAttribute('href')).toBe('/post-job?draft=draft-one');
  expect(screen.queryByRole('link', { name: 'View Applicants' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Drafts' }).getAttribute('href')).toBe('/my-listings?filter=draft');
});
