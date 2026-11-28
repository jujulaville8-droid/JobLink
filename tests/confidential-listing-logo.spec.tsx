import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CONFIDENTIAL_EMPLOYER_COMPANY_ID } from '@/lib/confidential-employer'
import type { JobResultsData } from '@/lib/job-results'

const LOGO = 'https://cdn.example/confidential-employer-logo.png'
const REAL_LOGO = 'https://cdn.example/hidden-employer-logo.png'
const REAL_NAME = 'Sentinel Hidden Employer'

const loadLogo = vi.hoisted(() => vi.fn(async () => null as string | null))
const db = vi.hoisted(() => ({ job: null as Record<string, unknown> | null }))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('Not found') },
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/jobs',
}))
vi.mock('@/components/AlertToggle', () => ({ default: () => null }))
vi.mock('@/lib/confidential-employer-logo', () => ({
  loadConfidentialEmployerLogo: () => loadLogo(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: db.job, error: null }) }) }) }),
  }),
}))

import JobDetailPage, { generateMetadata } from '@/app/jobs/[id]/page'
import JobResults from '@/components/JobResults'

const shellJob = {
  id: 'd09b1035-238f-4bf6-b7d1-11076d250317',
  company_id: CONFIDENTIAL_EMPLOYER_COMPANY_ID,
  title: 'Office Assistant',
  description: 'Answer calls and keep the front desk running.',
  location: "St. John's, Antigua",
  job_type: 'full_time',
  status: 'active',
  is_confidential: true,
  is_featured: false,
  posted_by_admin: true,
  created_at: '2026-11-20T12:00:00.000Z',
  expires_at: null,
  salary_visible: false,
  salary_min: null,
  salary_max: null,
  salary_type: null,
  benefits: [],
  company: null as { id: string; company_name: string; logo_url: string | null } | null,
}

function listing(id: string, companyId: string, name: string, logo: string | null, confidential = true) {
  return {
    id,
    company_id: companyId,
    title: `Role ${id}`,
    company: { id: companyId, company_name: name, logo_url: logo, location: 'Antigua', is_pro: false, is_confidential: confidential },
    is_confidential: confidential,
    location: 'Antigua',
    job_type: 'full_time',
    created_at: '2026-11-01',
    is_featured: false,
    salary_min: null,
    salary_max: null,
    salary_visible: false,
  }
}

async function cards(jobs: ReturnType<typeof listing>[]) {
  const element = await JobResults({
    searchParams: {},
    prefetchedResults: {
      jobs,
      count: jobs.length,
      error: null,
      currentPage: 1,
      supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
    } as unknown as JobResultsData,
  })
  return render(element)
}

beforeEach(() => {
  loadLogo.mockReset()
  loadLogo.mockResolvedValue(null)
  db.job = { ...shellJob, company: null }
})
afterEach(cleanup)

it('renders the stand-in logo on the job page when row security hides the company', async () => {
  loadLogo.mockResolvedValue(LOGO)
  const html = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: shellJob.id }) }))
  expect(html).toContain(`src="${LOGO}"`)
  expect(html).toContain('Confidential employer')
  expect(html).not.toContain('hiringOrganization')
  expect(html).not.toContain('/logo-icon.png')
  expect(html).not.toContain(REAL_NAME)
  expect(html).not.toContain(REAL_LOGO)
  const metadata = await generateMetadata({ params: Promise.resolve({ id: shellJob.id }) })
  expect(metadata.openGraph?.images).toEqual([{ url: LOGO, width: 200, height: 200, alt: 'Confidential employer' }])
  expect(JSON.stringify(metadata)).not.toContain(REAL_NAME)
  expect(metadata.title).toEqual({ absolute: 'Office Assistant at Confidential employer | JobLink' })
})

it('keeps the default icon when the stand-in company has no logo', async () => {
  const html = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: shellJob.id }) }))
  expect(html).toContain('src="/logo-icon.png"')
  expect(html).not.toContain(LOGO)
  const metadata = await generateMetadata({ params: Promise.resolve({ id: shellJob.id }) })
  expect(metadata.openGraph?.images).toEqual([])
})

it('shows the Confidential Employer logo for a listing still attached to its real company', async () => {
  loadLogo.mockResolvedValue(LOGO)
  db.job = {
    ...shellJob,
    id: '45b8e81c-d9b2-4604-867f-cd10835cf3a3',
    title: 'Clinical Medical Assistant',
    company_id: 'b2c41f29-5d70-4d4e-b978-38e46f20cbce',
    company: { id: 'b2c41f29-5d70-4d4e-b978-38e46f20cbce', company_name: REAL_NAME, logo_url: REAL_LOGO },
  }
  const html = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: '45b8e81c-d9b2-4604-867f-cd10835cf3a3' }) }))
  expect(html).toContain(`src="${LOGO}"`)
  expect(html).toContain('Confidential employer')
  expect(html).not.toContain('src="/logo-icon.png"')
  expect(html).not.toContain(REAL_NAME)
  expect(html).not.toContain(REAL_LOGO)
  expect(loadLogo).toHaveBeenCalled()
  const metadata = await generateMetadata({ params: Promise.resolve({ id: '45b8e81c-d9b2-4604-867f-cd10835cf3a3' }) })
  expect(metadata.openGraph?.images).toEqual([{ url: LOGO, width: 200, height: 200, alt: 'Confidential employer' }])
  expect(JSON.stringify(metadata)).not.toContain(REAL_LOGO)
  expect(JSON.stringify(metadata)).not.toContain(REAL_NAME)
})

it('uses the Confidential Employer logo on every confidential card, including a real employer', async () => {
  loadLogo.mockResolvedValue(LOGO)
  const masked = listing('masked', CONFIDENTIAL_EMPLOYER_COMPANY_ID, REAL_NAME, null)
  masked.company = null as unknown as typeof masked.company
  const { container } = await cards([
    listing('shell', CONFIDENTIAL_EMPLOYER_COMPANY_ID, 'Confidential Employer', LOGO),
    masked,
    listing('plain', 'acme', 'Acme', 'https://cdn.example/acme.png', false),
    listing('secret', 'secret-co', REAL_NAME, REAL_LOGO),
  ])
  expect(loadLogo).toHaveBeenCalled()
  const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
  expect(sources.filter((src) => src === LOGO).length).toBeGreaterThan(1)
  expect(sources).toContain('https://cdn.example/acme.png')
  expect(sources).not.toContain('/logo-icon.png')
  expect(sources).not.toContain(REAL_LOGO)
  expect(container.textContent).not.toContain(REAL_NAME)
  expect(container.textContent).toContain('Confidential employer')
  expect(container.textContent).toContain('Acme')
})
