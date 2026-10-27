import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import Page from '@/app/(dashboard)/analytics/page';
import { analyticsPeriod, summarize } from '@/lib/employer-analytics';
const mock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/employer-analytics', async original => ({ ...await original<object>(), getEmployerAnalytics: mock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), redirect: (url: string) => { throw new Error(url); } }));
afterEach(cleanup);
function fixture(count = 0) {
  const period = analyticsPeriod(7, new Date('2026-10-26T12:00:00Z'));
  return { state: 'available', companyName: 'Acme', period, ...summarize(Array.from({ length: count }, (_, i) => ({ id: `${i}`, title: `Job ${i}`, company_id: 'company', status: i === 0 ? 'draft' : 'active', created_at: `2026-10-${String(i + 1).padStart(2, '0')}T04:00:00Z`, applications: [{ count: 0 }] })), [], period), allApplications: 0, messages: { state: 'available', sent: 0, received: 0 }, views: null };
}
it('shows first use actions, real zeros, accessible daily table, and Phase 1 only', async () => {
  mock.mockResolvedValue(fixture()); render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('Your analytics starts with a listing')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Company Profile' }).getAttribute('href')).toBe('/company-profile');
  expect(screen.queryByText(/Recorded views/)).toBeNull();
  expect(screen.queryByText(/screening/i)).toBeNull();
  fireEvent.click(screen.getByText('Daily data for applications over time'));
  expect(screen.getByText('2026-10-26 (partial today)')).toBeTruthy();
  expect(screen.getByRole('img', { name: /Daily values in the table/ })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Period' })).toBeTruthy();
  expect(screen.getByText(/Sent counts include automated/)).toBeTruthy();
});
it('keeps summaries independent of table pagination and filters; drafts link to resume', async () => {
  mock.mockResolvedValue(fixture(24)); render(await Page({ searchParams: Promise.resolve({ status: 'draft' }) }));
  expect(screen.getByRole('link', { name: 'Resume draft' }).getAttribute('href')).toBe('/post-job?draft=0');
  expect(screen.getAllByText('23')).toHaveLength(2);
  cleanup(); render(await Page({ searchParams: Promise.resolve({ page: '2' }) }));
  expect(screen.getAllByRole('link', { name: 'Review applicants' })).toHaveLength(3);
  expect(screen.getByText('Page 2 of 2')).toBeTruthy();
});
it('shows partial coverage, unavailable daily history and isolated engagement errors', async () => {
  const data = fixture(1);
  mock.mockResolvedValue({ ...data, messages: { state: 'error' }, views: { state: 'available', launch: '2026-10-25T12:00:00Z', total: 3, partialDays: ['2026-10-25'], perJob: { '0': 3 }, daily: { '2026-10-24': null, '2026-10-25': 3, '2026-10-26': 0 } } });
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText(/Earlier history is not recorded/)).toBeTruthy();
  fireEvent.click(screen.getByText('Daily data for recorded views over time'));
  expect(screen.getByText('Not recorded')).toBeTruthy();
  expect(screen.getByText('2026-10-25 (partial launch day)')).toBeTruthy();
  expect(screen.getByText(/Some views are not recorded when request limits are reached/)).toBeTruthy();
  expect(screen.getByText(/Message counts unavailable/)).toBeTruthy();
  expect(screen.getByText(/Hold does not mean hired/)).toBeTruthy();
});
it.each(['error', 'setup'])('renders distinct %s state', async state => {
  mock.mockResolvedValue({ state }); render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole('link', { name: state === 'error' ? 'Retry analytics' : 'Company Profile' })).toBeTruthy();
  expect(screen.queryByText('Applications in period')).toBeNull();
});
it('does not convert unavailable views to zero', async () => {
  mock.mockResolvedValue({ ...fixture(1), views: { state: 'error', launch: '2026-10-25T12:00:00Z' } });
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText('— (unavailable)')).toBeTruthy();
  expect(screen.queryByText(/Recorded views in period: 0/)).toBeNull();
});
