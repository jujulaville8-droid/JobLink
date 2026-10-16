import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
const navigation = vi.hoisted(() => ({ push: vi.fn(), params: 'page=4&category=Food%20%26%20Beverage&job_type=part_time&q=old&location=English+Harbour' }))
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.params),
  usePathname: () => '/jobs',
}))
import JobSearchBar from '../src/components/JobSearchBar'
import JobFilters from '../src/components/JobFilters'
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('searches from page one while preserving selected filters, including on clear', () => {
  render(<JobSearchBar defaultValue="old" />)
  fireEvent.change(screen.getByRole('textbox', { name: /Search jobs/ }), { target: { value: 'Top Bun' } })
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

it('edits and clears location independently while preserving other criteria and resetting pagination', () => {
  render(<JobSearchBar defaultValue="old" />)
  expect((screen.getByLabelText('Job location') as HTMLInputElement).value).toBe('English Harbour')
  fireEvent.change(screen.getByLabelText('Job location'), { target: { value: '  St.   John’s  ' } })
  fireEvent.submit(screen.getByRole('search'))
  const changed = new URL(navigation.push.mock.calls[0][0], 'https://joblinkantigua.com')
  expect(changed.searchParams.get('location')).toBe('St. John’s')
  expect(changed.searchParams.get('q')).toBe('old')
  expect(changed.searchParams.has('page')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Clear location' }))
  const cleared = new URL(navigation.push.mock.calls[1][0], changed)
  expect(cleared.searchParams.has('location')).toBe(false)
  expect(cleared.searchParams.get('category')).toBe('Food & Beverage')
  expect(cleared.searchParams.get('job_type')).toBe('part_time')
})
it('refreshes displayed fields when back/forward navigation changes the URL', () => {
  const { rerender } = render(<JobSearchBar defaultValue="old" defaultLocation="English Harbour" />)
  navigation.params = 'q=cook&location=Barbuda'
  rerender(<JobSearchBar defaultValue="cook" defaultLocation="Barbuda" />)
  expect((screen.getByLabelText('Job location') as HTMLInputElement).value).toBe('Barbuda')
  expect((screen.getByLabelText(/Search jobs/) as HTMLInputElement).value).toBe('cook')
})
it('associates each visible industry label with a unique select, even with mobile and desktop copies mounted', () => {
  render(<JobFilters />)
  fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
  const selects = screen.getAllByLabelText('Industry / Category')
  expect(selects).toHaveLength(2)
  expect(new Set(selects.map(select => select.id)).size).toBe(2)
})
