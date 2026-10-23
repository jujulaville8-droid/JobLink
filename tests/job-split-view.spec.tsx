import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
const navigation = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), params: 'q=cook&page=2&job=bb1b011d-4e5c-4005-81b6-bc70c48acf4f' }))
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.params),
  usePathname: () => '/jobs',
}))
import JobCard, { type Job } from '@/components/JobCard'
import JobFilters from '@/components/JobFilters'
import JobSearchBar from '@/components/JobSearchBar'
import Pagination from '@/components/Pagination'
import SaveJobButton from '@/components/SaveJobButton'
import { BackToResults } from '@/components/JobSplitNavigation'

const job: Job = {
  id: 'bb1b011d-4e5c-4005-81b6-bc70c48acf4f',
  title: 'Carpenter / Boatbuilder',
  company_name: 'Woodstock BoatBuilders',
  location: 'Antigua',
  job_type: 'full_time',
  created_at: '2026-09-01T12:00:00Z',
}
const selectHref = `/jobs?q=cook&job=${job.id}`

function setViewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: desktop && query.includes('min-width'), media: query }))
}

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear() })

it('keeps the crawlable /jobs/[id] link while a plain click selects in place without scrolling on desktop', () => {
  setViewport(true)
  render(<JobCard job={job} selectHref={selectHref} />)
  const link = screen.getByRole('link', { name: `View ${job.title} at ${job.company_name}` })
  expect(link.getAttribute('href')).toBe(`/jobs/${job.id}`)
  fireEvent.click(link)
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith(selectHref, { scroll: false })
})

it('opens mobile details at the top and remembers it came from the list', () => {
  setViewport(false)
  render(<JobCard job={job} selectHref={selectHref} />)
  fireEvent.click(screen.getByRole('link', { name: /View Carpenter/ }))
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith(selectHref, { scroll: true })
  expect(sessionStorage.getItem('jobs:opened-from-list')).toBe('1')
})

it('leaves modified clicks to the browser so the full job page can open in a new tab', () => {
  setViewport(true)
  render(<JobCard job={job} selectHref={selectHref} />)
  fireEvent.click(screen.getByRole('link', { name: /View Carpenter/ }), { metaKey: true })
  expect(navigation.push).not.toHaveBeenCalled()
})

it('marks only the selected card as current', () => {
  render(<><JobCard job={job} selectHref={selectHref} selected /><JobCard job={{ ...job, id: 'other' }} selectHref="/jobs?job=other" /></>)
  const links = screen.getAllByRole('link', { name: /View Carpenter/ })
  expect(links[0].getAttribute('aria-current')).toBe('true')
  expect(links[1].hasAttribute('aria-current')).toBe(false)
  expect(screen.getAllByText('Selected')).toHaveLength(1)
})

it('drops the selected job when filters, search or pagination change the result set', () => {
  render(<JobFilters layout="bar" />)
  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Full Time' })[0])
  expect(new URL(navigation.push.mock.calls[0][0], 'https://x.test').searchParams.has('job')).toBe(false)
  cleanup()
  render(<JobSearchBar defaultValue="cook" />)
  fireEvent.submit(screen.getByRole('search'))
  const searched = new URL(navigation.push.mock.calls[1][0], 'https://x.test')
  expect(searched.searchParams.has('job')).toBe(false)
  expect(searched.searchParams.get('q')).toBe('cook')
  cleanup()
  render(<Pagination currentPage={2} totalPages={3} />)
  for (const link of screen.getAllByRole('link')) {
    expect(new URL(link.getAttribute('href')!, 'https://x.test').searchParams.has('job')).toBe(false)
  }
})

it('Back to results always navigates to its explicit list URL', () => {
  render(<BackToResults href="/jobs?q=cook" />)
  const back = screen.getByRole('link', { name: 'Back to results' })
  expect(back.getAttribute('href')).toBe('/jobs?q=cook')
  sessionStorage.setItem('jobs:opened-from-list', '1')
  fireEvent.click(back)
  expect(navigation.back).not.toHaveBeenCalled()
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/jobs?q=cook', { scroll: false })
})

it('keeps the card and detail-pane bookmarks in step', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ saved: true }) }))
  render(<><JobCard job={job} loggedIn selectHref={selectHref} /><SaveJobButton jobId={job.id} initialSaved={false} loggedIn large /></>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Save job', pressed: false })[1])
  expect(await screen.findByRole('button', { name: 'Unsave job' })).toBeTruthy()
  expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2)
})
