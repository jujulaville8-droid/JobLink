import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
vi.mock('next/navigation', () => ({ usePathname: () => '/jobs', useSearchParams: () => new URLSearchParams('q=chef&location=English+Harbour&job_type=part_time&page=4') }));
import Pagination from '@/components/Pagination';
afterEach(cleanup);
it('names every page link, identifies the current page and preserves search context', () => {
  render(<Pagination currentPage={4} totalPages={12} />);
  expect(screen.getByRole('navigation', { name: 'Job results pages' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Page 4' }).getAttribute('aria-current')).toBe('page');
  for (const name of ['Next page', 'Previous page', 'Page 1', 'Page 12']) {
    const url = new URL(screen.getByRole('link', { name }).getAttribute('href')!, 'https://joblinkantigua.com');
    expect(url.searchParams.get('location')).toBe('English Harbour');
    expect(url.searchParams.get('q')).toBe('chef');
    expect(url.searchParams.get('job_type')).toBe('part_time');
  }
});
it('excludes unavailable arrows from the accessibility tree', () => {
  render(<Pagination currentPage={1} totalPages={2} />);
  expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Next page' })).toBeTruthy();
});
