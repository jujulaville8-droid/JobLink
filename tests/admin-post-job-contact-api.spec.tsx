// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), from: vi.fn(), adminRead: vi.fn(), companyLookup: vi.fn(), companySave: vi.fn(),
  companyInsert: vi.fn(), companyUpdate: vi.fn(), companyCreated: vi.fn(),
  createUser: vi.fn(), userUpsert: vi.fn(), listingInsert: vi.fn(), listingCreated: vi.fn(),
  after: vi.fn(), alerts: vi.fn(), send: vi.fn(), buildEmail: vi.fn(),
}))
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: mocks.after }))
vi.mock('@/lib/api-auth', () => ({ requireVerifiedUser: mocks.auth }))
vi.mock('@/lib/job-alert-matcher', () => ({ processJobAlerts: mocks.alerts }))
vi.mock('@/lib/email', () => ({ BASE_URL: 'https://joblinkantigua.com' }))
vi.mock('@/lib/email-templates', () => ({ buildEmailHtml: mocks.buildEmail }))
vi.mock('resend', () => ({ Resend: class { batch = { send: mocks.send } } }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from, auth: { admin: { createUser: mocks.createUser } } }),
}))
import { POST } from '@/app/api/admin/post-job/route'

const companyId = '9fde7fc7-70b3-4354-9d11-d520f4ec09f9'
const createdCompanyId = '22222222-2222-4222-8222-222222222222'
const listingId = '33333333-3333-4333-8333-333333333333'
const job = { title: 'Example vacancy', description: 'Employer supplied vacancy description.', category: 'Hospitality & Tourism', job_type: 'full_time' }
const send = (body: unknown) => POST(new NextRequest('https://joblinkantigua.com/api/admin/post-job', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'admin-user' }, isAdmin: true })
  mocks.adminRead.mockResolvedValue({ data: { is_admin: true }, error: null })
  mocks.companyLookup.mockResolvedValue({ data: null, error: null })
  mocks.companySave.mockResolvedValue({ data: { id: companyId }, error: null })
  mocks.companyCreated.mockResolvedValue({ data: { id: createdCompanyId }, error: null })
  mocks.listingCreated.mockResolvedValue({ data: { id: listingId }, error: null })
  mocks.createUser.mockResolvedValue({ data: { user: { id: 'placeholder-user' } }, error: null })
  mocks.userUpsert.mockResolvedValue({ error: null })
  mocks.alerts.mockResolvedValue(undefined)
  mocks.from.mockImplementation((table: string) => {
    let operation = 'read'
    const query = {
      select: () => query, eq: () => query, ilike: () => query,
      insert: (value: unknown) => {
        operation = 'insert'
        if (table === 'companies') mocks.companyInsert(value)
        if (table === 'job_listings') mocks.listingInsert(value)
        return query
      },
      update: (value: unknown) => { operation = 'update'; mocks.companyUpdate(value); return query },
      upsert: mocks.userUpsert,
      maybeSingle: () => operation === 'update' ? mocks.companySave() : mocks.companyLookup(),
      single: () => table === 'users' ? mocks.adminRead()
        : table === 'companies' ? mocks.companyCreated() : mocks.listingCreated(),
    }
    return query
  })
})

describe('admin posting employer notification email', () => {
  it('saves a normalized contact on an existing company before posting', async () => {
    const response = await send({ ...job, company_id: companyId, contact_email: ' HIRING@EXAMPLE.COM ' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, listingId, companyId })
    expect(mocks.companyUpdate).toHaveBeenCalledWith({ contact_email: 'hiring@example.com' })
    expect(mocks.listingInsert).toHaveBeenCalledWith(expect.objectContaining({ company_id: companyId }))
    expect(mocks.companyUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.listingInsert.mock.invocationCallOrder[0])
    expect(mocks.after).toHaveBeenCalledOnce()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.alerts).toHaveBeenCalledWith(listingId)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it.each(['', '   ', null])('explicitly clears a saved company contact for %j', async contactEmail => {
    expect((await send({ ...job, company_id: companyId, contact_email: contactEmail })).status).toBe(200)
    expect(mocks.companyUpdate).toHaveBeenCalledWith({ contact_email: null })
  })

  it('preserves the saved contact when an older caller omits the field', async () => {
    expect((await send({ ...job, company_id: companyId })).status).toBe(200)
    expect(mocks.companyUpdate).not.toHaveBeenCalled()
    expect(mocks.listingInsert).toHaveBeenCalledOnce()
  })

  it('saves the supplied contact while creating a new company', async () => {
    const response = await send({ ...job, new_company: { company_name: ' Example Employer ', contact_email: ' OWNER@EXAMPLE.COM ' } })
    expect(response.status).toBe(200)
    expect(mocks.createUser).toHaveBeenCalledOnce()
    expect(mocks.companyInsert).toHaveBeenCalledWith(expect.objectContaining({
      company_name: 'Example Employer', user_id: 'placeholder-user', contact_email: 'owner@example.com',
    }))
    expect(mocks.listingInsert).toHaveBeenCalledWith(expect.objectContaining({ company_id: createdCompanyId }))
  })

  it('saves supplied contact on the existing company when the new-company name matches', async () => {
    mocks.companyLookup.mockResolvedValue({ data: { id: companyId }, error: null })
    const response = await send({ ...job, new_company: { company_name: 'Example Employer', contact_email: 'OWNER@EXAMPLE.COM' } })
    expect(response.status).toBe(200)
    expect(mocks.companyUpdate).toHaveBeenCalledWith({ contact_email: 'owner@example.com' })
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.companyInsert).not.toHaveBeenCalled()
    expect(mocks.listingInsert).toHaveBeenCalledWith(expect.objectContaining({ company_id: companyId }))
  })

  it('preserves a duplicate-name company contact if the caller omitted contact_email', async () => {
    mocks.companyLookup.mockResolvedValue({ data: { id: companyId }, error: null })
    expect((await send({ ...job, new_company: { company_name: 'Example Employer' } })).status).toBe(200)
    expect(mocks.companyUpdate).not.toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.listingInsert).toHaveBeenCalledOnce()
  })

  it.each(['not-email', 'one@example.com,two@example.com', 'admin-company-dead@joblinkantigua.com', 'import+fixture-company@joblinkantigua.com', 'owner@example.com\r\nBcc: other@example.com', 42])(
    'rejects an invalid existing-company contact %j before writes', async contactEmail => {
      expect((await send({ ...job, company_id: companyId, contact_email: contactEmail })).status).toBe(400)
      expect(mocks.companyLookup).not.toHaveBeenCalled()
      expect(mocks.createUser).not.toHaveBeenCalled()
      expect(mocks.companyInsert).not.toHaveBeenCalled()
      expect(mocks.companyUpdate).not.toHaveBeenCalled()
      expect(mocks.listingInsert).not.toHaveBeenCalled()
      expect(mocks.after).not.toHaveBeenCalled()
    },
  )

  it.each(['not-email', 'one@example.com;two@example.com', 'admin-company-dead@joblinkantigua.com', 'import+fixture-company@joblinkantigua.com', { email: 'owner@example.com' }])(
    'rejects an invalid new-company contact %j before placeholder creation or writes', async contactEmail => {
      expect((await send({ ...job, new_company: { company_name: 'Example Employer', contact_email: contactEmail } })).status).toBe(400)
      expect(mocks.companyLookup).not.toHaveBeenCalled()
      expect(mocks.createUser).not.toHaveBeenCalled()
      expect(mocks.userUpsert).not.toHaveBeenCalled()
      expect(mocks.companyInsert).not.toHaveBeenCalled()
      expect(mocks.companyUpdate).not.toHaveBeenCalled()
      expect(mocks.listingInsert).not.toHaveBeenCalled()
    },
  )

  it('requires the server-managed admin flag even when authentication succeeded', async () => {
    mocks.adminRead.mockResolvedValue({ data: { is_admin: false }, error: null })
    expect((await send({ ...job, new_company: { company_name: 'Example Employer', contact_email: 'owner@example.com' } })).status).toBe(403)
    expect(mocks.companyLookup).not.toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.companyInsert).not.toHaveBeenCalled()
    expect(mocks.listingInsert).not.toHaveBeenCalled()
  })

  it('returns the authentication refusal without any service client reads', async () => {
    mocks.auth.mockResolvedValue({ error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) })
    expect((await send({ ...job, company_id: companyId, contact_email: 'owner@example.com' })).status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('does not publish a listing when the contact cannot be saved', async () => {
    mocks.companySave.mockResolvedValue({ data: null, error: { message: 'private database diagnostic' } })
    const response = await send({ ...job, company_id: companyId, contact_email: 'owner@example.com' })
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('private database diagnostic')
    expect(mocks.listingInsert).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('does not publish a listing when the company to update does not exist', async () => {
    mocks.companySave.mockResolvedValue({ data: null, error: null })
    expect((await send({ ...job, company_id: companyId, contact_email: 'owner@example.com' })).status).toBe(404)
    expect(mocks.listingInsert).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })
})
