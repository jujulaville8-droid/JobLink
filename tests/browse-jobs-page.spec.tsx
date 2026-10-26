import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: api.getUser }, from: api.from }),
}));
vi.mock('@/components/JobFilters', () => ({ default: () => <div>Job filters</div> }));
vi.mock('@/components/JobResults', () => ({
  default: ({ searchParams, gridClassName }: { searchParams: { q?: string }; gridClassName: string }) => (
    <div className={gridClassName}>Job results: {searchParams.q}</div>
  ),
}));

import BrowseJobsPage from '@/app/(dashboard)/browse-jobs/page';

beforeEach(() => {
  vi.resetAllMocks();
  api.getUser.mockResolvedValue({ data: { user: { id: 'seeker-user' } } });
  api.from.mockReturnValue(api);
  api.select.mockReturnValue(api);
  api.eq.mockReturnValue(api);
  api.maybeSingle.mockResolvedValue({ data: { first_name: 'Julian' }, error: null });
});
afterEach(cleanup);

async function show(q?: string) {
  return render(await BrowseJobsPage({ searchParams: Promise.resolve({ q }) }));
}

function expectHeader(heading: string, label = true) {
  const h1 = screen.getByRole('heading', { level: 1 });
  expect(h1.textContent).toBe(heading);
  expect(h1.nextElementSibling?.textContent).toBe('Discover opportunities across Antigua and Barbuda');
  if (label) {
    expect(h1.parentElement?.nextElementSibling).toBe(screen.getByRole('heading', { level: 2, name: 'Jobs for you' }));
  } else {
    expect(screen.queryByRole('heading', { level: 2, name: 'Jobs for you' })).toBeNull();
  }
}

describe('Browse Jobs welcome heading', () => {
  it('greets the seeker using the dashboard profile lookup', async () => {
    await show();
    expectHeader('Welcome, Julian');
    expect(api.getUser).toHaveBeenCalledOnce();
    expect(api.from).toHaveBeenCalledWith('seeker_profiles');
    expect(api.select).toHaveBeenCalledWith('first_name');
    expect(api.eq).toHaveBeenCalledWith('user_id', 'seeker-user');
    expect(api.maybeSingle).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Results for/)).toBeNull();
  });

  it.each([null, { first_name: null }, { first_name: '' }, { first_name: '  ' }])('falls back without a profile or first name: %j', async profile => {
    api.maybeSingle.mockResolvedValue({ data: profile, error: null });
    await show();
    expectHeader('Browse Jobs', false);
  });

  it('falls back without a signed in user and skips the profile query', async () => {
    api.getUser.mockResolvedValue({ data: { user: null } });
    await show();
    expectHeader('Browse Jobs', false);
    expect(api.from).not.toHaveBeenCalled();
  });

  it('keeps the search notice and filters/results after the section heading', async () => {
    await show('cashier');
    expectHeader('Welcome, Julian');
    const section = screen.getByRole('heading', { level: 2 });
    expect(section.nextElementSibling?.textContent).toBe('Results for “cashier”');
    const columns = section.nextElementSibling?.nextElementSibling;
    expect(columns?.contains(screen.getByText('Job filters'))).toBe(true);
    const results = screen.getByText('Job results: cashier');
    expect(columns?.contains(results)).toBe(true);
    expect(results.className).toBe('grid grid-cols-1 lg:grid-cols-2 gap-4');
  });
});
