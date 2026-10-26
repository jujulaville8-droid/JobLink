import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { INDUSTRIES } from '@/lib/types';

const api = vi.hoisted(() => ({
  createClient: vi.fn(), getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: api.createClient }));

beforeEach(() => {
  vi.resetAllMocks();
  api.createClient.mockResolvedValue({ auth: { getUser: api.getUser }, from: api.from });
  api.getUser.mockResolvedValue({ data: { user: null }, error: null });
  api.from.mockReturnValue(api);
  api.select.mockReturnValue(api);
  api.eq.mockReturnValue(api);
  api.maybeSingle.mockResolvedValue({ data: { first_name: 'Julian' }, error: null });
});
vi.mock('@/components/JobDetailPane', () => ({ default: () => null }));
vi.mock('@/components/JobSplitNavigation', () => ({ RestoreListFocus: () => null }));
vi.mock('@/components/JobResults', () => ({ default: () => null }));
vi.mock('@/components/JobFilters', () => ({ default: () => null }));
vi.mock('@/components/JobSearchBar', () => ({ default: () => null }));
vi.mock('@/components/JobIndustryShortcuts', () => ({ default: () => null }));

import JobsPage from '@/app/jobs/page';

afterEach(cleanup);

describe('visible category page identity', () => {
  it.each(INDUSTRIES)('identifies %s in the heading and introduction', async category => {
    render(await JobsPage({ searchParams: Promise.resolve({ category }) }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(`${category} Jobs`);
    expect(screen.getByText(`Browse ${category} job listings in Antigua and Barbuda.`)).toBeDefined();
  });

  it.each(['retail & trade', ' RETAIL & TRADE '])('normalizes category copy: %s', async category => {
    render(await JobsPage({ searchParams: Promise.resolve({ category }) }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Retail & Trade Jobs');
    expect(screen.getByText('Browse Retail & Trade job listings in Antigua and Barbuda.')).toBeDefined();
  });

  it.each([
    {},
    { category: '' },
    { category: 'Unknown category' },
    { q: 'cashier' },
    { location: 'Antigua' },
    { job_type: 'full_time' },
  ])('keeps general browsing copy without a known category: %j', async searchParams => {
    render(await JobsPage({ searchParams: Promise.resolve(searchParams) }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Browse Jobs');
    expect(screen.getByText('Discover opportunities across Antigua and Barbuda')).toBeDefined();
  });

  it('retains category identity and the query indicator with additional filters', async () => {
    render(await JobsPage({
      searchParams: Promise.resolve({ category: 'Retail & Trade', q: 'cashier', job_type: 'full_time' }),
    }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Retail & Trade Jobs');
    expect(screen.getByText(/Results for/).textContent).toBe('Results for “cashier”');
  });
});

async function showWelcome(category?: string) {
  // Select a detail explicitly so this test does not execute an async child RSC.
  render(await JobsPage({ searchParams: Promise.resolve({ category, job: 'selected-job' }) }));
}

function expectHeading(text: string) {
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(text);
}

describe('public jobs welcome heading', () => {
  beforeEach(() => {
    api.getUser.mockResolvedValue({ data: { user: { id: 'seeker-user' } }, error: null });
  });

  it('greets a signed in seeker with only the required profile column', async () => {
    await showWelcome();
    expectHeading('Welcome, Julian');
    expect(api.from).toHaveBeenCalledWith('seeker_profiles');
    expect(api.select).toHaveBeenCalledWith('first_name');
    expect(api.eq).toHaveBeenCalledWith('user_id', 'seeker-user');
    expect(api.maybeSingle).toHaveBeenCalledOnce();
    expect(screen.getByText('Discover opportunities across Antigua and Barbuda')).toBeDefined();
    const label = screen.getByRole('heading', { level: 2, name: 'Jobs for you' });
    expect(label.previousElementSibling?.contains(screen.getByRole('heading', { level: 1 }))).toBe(true);
    expect(label.nextElementSibling?.className).toContain('lg:flex-row');
    expect(label.className).toContain('hidden lg:block');
  });

  it('gives category priority and skips unnecessary personalization', async () => {
    await showWelcome('Retail & Trade');
    expectHeading('Retail & Trade Jobs');
    expect(api.createClient).not.toHaveBeenCalled();
  });

  it('keeps signed out browsing public without querying profiles', async () => {
    api.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await showWelcome();
    expectHeading('Browse Jobs');
    expect(api.from).not.toHaveBeenCalled();
  });

  it.each([null, { first_name: null }, { first_name: '' }])('falls back for missing profile/name: %j', async data => {
    api.maybeSingle.mockResolvedValue({ data, error: null });
    await showWelcome();
    expectHeading('Browse Jobs');
  });

  it('falls back for a returned profile error', async () => {
    api.maybeSingle.mockResolvedValue({ data: { first_name: 'Julian' }, error: { message: 'Unavailable' } });
    await showWelcome();
    expectHeading('Browse Jobs');
  });

  it.each(['createClient', 'getUser', 'maybeSingle'] as const)('falls back when %s throws', async method => {
    api[method].mockRejectedValue(new Error('Unavailable'));
    await showWelcome();
    expectHeading('Browse Jobs');
  });

  it('skips profiles when authentication returns an error', async () => {
    api.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unavailable' } });
    await showWelcome();
    expectHeading('Browse Jobs');
    expect(api.from).not.toHaveBeenCalled();
  });
});
