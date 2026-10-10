import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { INDUSTRIES } from '@/lib/types';

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => { throw new Error('The page heading must not add a database query'); },
}));
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
