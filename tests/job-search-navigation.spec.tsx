import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams('page=4&category=Food%20%26%20Beverage&job_type=part_time&q=old'),
  usePathname: () => '/jobs',
}))
import JobSearchBar from '../src/components/JobSearchBar'
import JobFilters from '../src/components/JobFilters'
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('searches from page one while preserving selected filters, including on clear', () => {
  render(<JobSearchBar defaultValue="old" />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Top Bun' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Search' }).closest('form')!)
  const url = new URL(navigation.push.mock.calls[0][0], 'https://joblinkantigua.com')
  expect(url.searchParams.has('page')).toBe(false)
  expect(url.searchParams.get('q')).toBe('Top Bun')
  expect(url.searchParams.get('category')).toBe('Food & Beverage')
  expect(url.searchParams.get('job_type')).toBe('part_time')
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  const clear = new URL(navigation.push.mock.calls[1][0], url)
  expect(clear.searchParams.has('q')).toBe(false)
  expect(clear.searchParams.has('page')).toBe(false)
  expect(clear.searchParams.get('job_type')).toBe('part_time')
})
it('changing a job-type filter resets pagination and preserves the search', () => {
  render(<JobFilters />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Full Time' }))
  const url = new URL(navigation.push.mock.calls[0][0], 'https://joblinkantigua.com')
  expect(url.searchParams.has('page')).toBe(false)
  expect(url.searchParams.get('q')).toBe('old')
  expect(url.searchParams.getAll('job_type')).toEqual(['part_time', 'full_time'])
})
