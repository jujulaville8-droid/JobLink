import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { INDUSTRIES } from '@/lib/types';

const { from, select, eq, order, range } = vi.hoisted(() => {
  const range = vi.fn();
  const order = vi.fn(() => ({ range }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, order, range };
});
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }));

import JobIndustryShortcuts from '@/components/JobIndustryShortcuts';

async function renderShortcuts() {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(await JobIndustryShortcuts());
  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
  range.mockReset();
  range.mockResolvedValue({ data: [], error: null });
});

describe('job industry shortcuts', () => {
  it('links every populated industry, including Food & Beverage beyond the first six', async () => {
    const leading = INDUSTRIES.slice(0, 6);
    range.mockResolvedValue({
      data: [...leading.flatMap(category => [{ category }, { category }]), { category: 'Food & Beverage' }],
      error: null,
    });
    const container = await renderShortcuts();
    const links = [...container.querySelectorAll('a')];
    const expected = [...leading].sort((a, b) => a.localeCompare(b)).concat('Food & Beverage');
    expect(links).toHaveLength(7);
    expect(links.map(link => link.querySelector('span')?.textContent)).toEqual(expected);
    expect(links.map(link => link.getAttribute('href'))).toEqual(
      expected.map(category => `/jobs?category=${encodeURIComponent(category)}`),
    );
    expect(links.slice(0, 6).every(link => link.textContent?.includes('2 open jobs'))).toBe(true);
    expect(links[6].textContent).toContain('1 open job');
    expect(from).toHaveBeenCalledWith('job_listings');
    expect(select).toHaveBeenCalledWith('category');
    expect(eq).toHaveBeenCalledWith('status', 'active');
    expect(order).toHaveBeenCalledWith('id');
    expect(range).toHaveBeenCalledWith(0, 999);
  });

  it('supports every known populated industry without adding unknown or empty categories', async () => {
    range.mockResolvedValue({
      data: [...INDUSTRIES.map(category => ({ category })), { category: 'Unknown industry' }, { category: '' }, { category: null }],
      error: null,
    });
    const container = await renderShortcuts();
    expect(container.querySelectorAll('a')).toHaveLength(INDUSTRIES.length);
    expect(container.textContent).not.toContain('Unknown industry');
  });

  it('does not create links for known industries without vacancies', async () => {
    range.mockResolvedValue({ data: [{ category: 'Food & Beverage' }], error: null });
    const container = await renderShortcuts();
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.textContent).not.toContain('Healthcare');
  });

  it('counts all pages and keeps the existing responsive grid', async () => {
    range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => ({ category: 'Healthcare' })), error: null })
      .mockResolvedValueOnce({ data: [{ category: 'Healthcare' }, { category: 'Food & Beverage' }], error: null });
    const container = await renderShortcuts();
    expect(range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(container.querySelector('a')?.textContent).toContain('1001 open jobs');
    const grid = container.querySelector('a')?.parentElement;
    expect(grid?.classList.contains('grid-cols-2')).toBe(true);
    expect(grid?.classList.contains('sm:grid-cols-3')).toBe(true);
    expect(grid?.classList.contains('lg:grid-cols-6')).toBe(true);
  });

  it.each([[], null, [{ category: 'Unknown industry' }]])('hides the section with no known populated industries: %j', async data => {
    range.mockResolvedValue({ data, error: null });
    expect(await JobIndustryShortcuts()).toBeNull();
  });

  it('hides the section on a query error instead of showing incomplete counts', async () => {
    range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => ({ category: 'Healthcare' })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Query failed' } });
    expect(await JobIndustryShortcuts()).toBeNull();
  });
});
