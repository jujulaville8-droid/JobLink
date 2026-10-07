import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminCompaniesPage from '@/app/(dashboard)/admin/companies/page'
import AdminPostJobPage from '@/app/(dashboard)/admin/post-job/page'
import { INDUSTRIES } from '@/lib/types'
import type { ComponentProps } from 'react'

const navigation = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => navigation }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } }, error: null }) } }),
}))
vi.mock('motion/react', async () => {
  const { createElement } = await import('react')
  return { motion: { div: (props: ComponentProps<'div'> & Record<string, unknown>) => {
    const { children, ...rest } = props
    const htmlProps = Object.fromEntries(Object.entries(rest).filter(([key]) => !['variants', 'initial', 'animate'].includes(key)))
    return createElement('div', htmlProps, children)
  } } }
})

const companies = [
  { id: '1b11e815-e80b-4b35-affe-55c1d1fc16db', company_name: 'MOfit', industry: 'Wellness', location: 'St Johns', contact_email: 'fitness@example.com', logo_url: null },
  { id: '9fde7fc7-70b3-4354-9d11-d520f4ec09f9', company_name: 'Nobu Barbuda', industry: 'Hospitality', location: 'Barbuda', contact_email: 'hiring@example.com', logo_url: null },
  { id: '6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961', company_name: 'Woodstock', industry: 'Hospitality', location: 'English Harbour', contact_email: null, logo_url: null },
]
let fetchMock: ReturnType<typeof vi.fn>
const patches = () => fetchMock.mock.calls.filter(call => call[1]?.method === 'PATCH')
const contactField = () => screen.getByLabelText('Employer notification email') as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url === '/api/admin/post-job/companies') return Promise.resolve(Response.json({ companies }))
    if (url === '/api/admin/companies' && options?.method === 'PATCH') {
      const body = JSON.parse(String(options.body))
      const company = companies.find(row => row.id === body.company_id)
      return Promise.resolve(Response.json({ success: true, company: { ...company, contact_email: body.contact_email } }))
    }
    if (url === '/api/admin/post-job' && options?.method === 'POST') {
      return Promise.resolve(Response.json({ error: 'Mock submission complete.' }, { status: 503 }))
    }
    throw new Error(`Unexpected mocked request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

describe('admin posting notification email form', () => {
  const submissions = () => fetchMock.mock.calls.filter(call => call[0] === '/api/admin/post-job')
  async function fillJob(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText('Job title *'), 'Example vacancy')
    await user.type(screen.getByPlaceholderText('Job description *'), 'Employer supplied vacancy description.')
    await user.selectOptions(screen.getByDisplayValue('Category *'), INDUSTRIES[0])
  }

  it('loads the saved contact for each selected company without reusing another company inbox', async () => {
    const user = userEvent.setup()
    render(<AdminPostJobPage />)
    await user.click(await screen.findByRole('button', { name: /Nobu Barbuda/i }))
    expect(contactField().value).toBe('hiring@example.com')
    await user.click(screen.getByRole('button', { name: /Woodstock/i }))
    expect(contactField().value).toBe('')
    await user.click(screen.getByRole('button', { name: /MOfit/i }))
    expect(contactField().value).toBe('fitness@example.com')
    expect(submissions()).toHaveLength(0)
  })

  it('includes the edited contact with the selected company when submitting a job', async () => {
    const user = userEvent.setup()
    render(<AdminPostJobPage />)
    await user.click(await screen.findByRole('button', { name: /Nobu Barbuda/i }))
    await user.clear(contactField())
    await user.type(contactField(), 'new.hiring@example.com')
    await fillJob(user)
    await user.click(screen.getByRole('button', { name: /Post Job.*Go Live Now/ }))
    await screen.findByText('Mock submission complete.')
    expect(submissions()).toHaveLength(1)
    expect(JSON.parse(submissions()[0][1].body)).toMatchObject({
      company_id: companies[1].id, contact_email: 'new.hiring@example.com', title: 'Example vacancy',
    })
  })

  it('includes the employer contact inside new_company for a new company', async () => {
    const user = userEvent.setup()
    render(<AdminPostJobPage />)
    await user.click(await screen.findByRole('button', { name: 'New Company' }))
    await user.type(screen.getByPlaceholderText('Company name *'), 'Example Employer')
    await user.type(contactField(), 'owner@example.com')
    await fillJob(user)
    await user.click(screen.getByRole('button', { name: /Post Job.*Go Live Now/ }))
    await screen.findByText('Mock submission complete.')
    expect(JSON.parse(submissions()[0][1].body)).toMatchObject({
      new_company: { company_name: 'Example Employer', contact_email: 'owner@example.com' },
    })
  })

  it('refuses a placeholder inbox before submitting a vacancy', async () => {
    const user = userEvent.setup()
    render(<AdminPostJobPage />)
    await user.click(await screen.findByRole('button', { name: /Nobu Barbuda/i }))
    await user.clear(contactField())
    await user.type(contactField(), 'admin-company-dead@joblinkantigua.com')
    await fillJob(user)
    await user.click(screen.getByRole('button', { name: /Post Job.*Go Live Now/ }))
    expect(await screen.findByText('Enter one valid employer notification email, or leave it blank.')).toBeTruthy()
    expect(submissions()).toHaveLength(0)
    expect(contactField().value).toBe('admin-company-dead@joblinkantigua.com')
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('admin company notification email form', () => {
  it('loads the selected company contact and changes it when selecting another company', async () => {
    const user = userEvent.setup()
    render(<AdminCompaniesPage />)
    await screen.findByLabelText('Find a company')
    expect(contactField().value).toBe('fitness@example.com')
    await user.click(screen.getByRole('button', { name: /Nobu Barbuda/i }))
    expect(screen.getByRole('heading', { name: 'Nobu Barbuda' })).toBeTruthy()
    expect(contactField().value).toBe('hiring@example.com')
    expect(patches()).toHaveLength(0)
  })

  it.each([
    ['nObU', /Nobu Barbuda/], ['barbuda', /Nobu Barbuda/], ['wellness', /MOfit/],
    ['6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961', /Woodstock/],
  ])('filters by name, location, industry, or company ID for %s', async (query, expectedCompany) => {
    const user = userEvent.setup()
    render(<AdminCompaniesPage />)
    await user.type(await screen.findByLabelText('Find a company'), query)
    expect(screen.getByText('1 of 3 companies')).toBeTruthy()
    expect(screen.getByRole('button', { name: expectedCompany })).toBeTruthy()
    expect(patches()).toHaveLength(0)
  })

  it('shows no matches for an unmatched search', async () => {
    const user = userEvent.setup()
    render(<AdminCompaniesPage />)
    await user.type(await screen.findByLabelText('Find a company'), 'missing company')
    expect(screen.getByText('No companies match that search.')).toBeTruthy()
    expect(screen.getByText('0 of 3 companies')).toBeTruthy()
  })

  it('saves the normalized email for the selected company and retains the saved response', async () => {
    const user = userEvent.setup()
    render(<AdminCompaniesPage />)
    await user.click(await screen.findByRole('button', { name: /Nobu Barbuda/i }))
    await user.clear(contactField())
    await user.type(contactField(), 'NEW.HIRING@EXAMPLE.COM')
    await user.click(screen.getByRole('button', { name: 'Save notification email' }))
    expect((await screen.findByRole('status')).textContent).toBe('Employer notification email saved.')
    expect(patches()).toHaveLength(1)
    const [url, options] = patches()[0]
    expect(url).toBe('/api/admin/companies')
    expect(JSON.parse(options.body)).toEqual({ company_id: companies[1].id, contact_email: 'new.hiring@example.com' })
    expect(contactField().value).toBe('new.hiring@example.com')
    await user.click(screen.getByRole('button', { name: /MOfit/i }))
    await user.click(screen.getByRole('button', { name: /Nobu Barbuda/i }))
    expect(contactField().value).toBe('new.hiring@example.com')
  })

  it('clears the selected saved inbox and disables a redundant clear', async () => {
    const user = userEvent.setup()
    render(<AdminCompaniesPage />)
    await screen.findByLabelText('Find a company')
    await user.click(screen.getByRole('button', { name: 'Clear notification email' }))
    expect((await screen.findByRole('status')).textContent).toBe('Employer notification email cleared.')
    expect(JSON.parse(patches()[0][1].body)).toEqual({ company_id: companies[0].id, contact_email: null })
    expect(contactField().value).toBe('')
    expect((screen.getByRole('button', { name: 'Clear notification email' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it.each(['owner@example.com,other@example.com', 'admin-company-dead@joblinkantigua.com'])('refuses unsafe contact %s in the browser before a save request', async email => {
    const user = userEvent.setup()
    render(<AdminCompaniesPage />)
    await screen.findByLabelText('Find a company')
    await user.clear(contactField())
    await user.type(contactField(), email)
    await user.click(screen.getByRole('button', { name: 'Save notification email' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/one valid employer notification email/i)
    expect(patches()).toHaveLength(0)
    expect(contactField().value).toBe(email)
  })

  it('retains the draft after a rejected save and permits a retry', async () => {
    const user = userEvent.setup()
    render(<AdminCompaniesPage />)
    await screen.findByLabelText('Find a company')
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Failed to save employer notification email.' }, { status: 503 }))
    await user.clear(contactField())
    await user.type(contactField(), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Save notification email' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to save employer notification email.')
    expect(contactField().value).toBe('new@example.com')
    expect(screen.queryByRole('status')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save notification email' }))
    await screen.findByRole('status')
    expect(patches()).toHaveLength(2)
    expect(contactField().value).toBe('new@example.com')
  })

  it('prevents duplicate save and clear actions while a save is pending', async () => {
    let finishSave!: (response: Response) => void
    const user = userEvent.setup()
    render(<AdminCompaniesPage />)
    await screen.findByLabelText('Find a company')
    await user.clear(contactField())
    await user.type(contactField(), 'pending@example.com')
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve }))
    await user.click(screen.getByRole('button', { name: 'Save notification email' }))
    expect((screen.getByRole('button', { name: 'Save notification email' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Clear notification email' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Nobu Barbuda/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(contactField().disabled).toBe(true)
    expect((screen.getByLabelText('Or paste a logo URL') as HTMLInputElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: /Nobu Barbuda/i }))
    await user.type(contactField(), ' should stay frozen')
    expect(screen.getByRole('heading', { name: 'MOfit' })).toBeTruthy()
    expect(contactField().value).toBe('pending@example.com')
    await user.click(screen.getByRole('button', { name: 'Save notification email' }))
    expect(patches()).toHaveLength(1)
    finishSave(Response.json({ success: true, company: { ...companies[0], contact_email: 'pending@example.com' } }))
    await screen.findByRole('status')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save notification email' }) as HTMLButtonElement).disabled).toBe(false))
    expect(contactField().value).toBe('pending@example.com')
    expect(contactField().disabled).toBe(false)
    expect((screen.getByRole('button', { name: /Nobu Barbuda/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows a failed load and retries without displaying an empty successful list', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Admin access required' }, { status: 403 }))
    const user = userEvent.setup()
    render(<AdminCompaniesPage />)
    expect((await screen.findByRole('alert')).textContent).toBe('Admin access required')
    expect(screen.queryByLabelText('Find a company')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByLabelText('Find a company')
    expect(contactField().value).toBe('fitness@example.com')
  })
})
