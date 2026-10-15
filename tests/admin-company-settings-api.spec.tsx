// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), createAdmin: vi.fn(), from: vi.fn(), update: vi.fn(),
  eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(),
}))
vi.mock('@/lib/api-auth', () => ({ requireAdmin: mocks.auth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdmin }))
import { PATCH } from '@/app/api/admin/companies/route'

const companyId = '9fde7fc7-70b3-4354-9d11-d520f4ec09f9'
const company = { id: companyId, company_name: 'Example Employer', contact_email: 'hiring@example.com' }
const send = (body: unknown) => PATCH(new NextRequest('https://joblinkantigua.com/api/admin/companies', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'admin' }, isAdmin: true })
  const query = { update: mocks.update, eq: mocks.eq, select: mocks.select, maybeSingle: mocks.maybeSingle }
  for (const mock of [mocks.update, mocks.eq, mocks.select]) mock.mockReturnValue(query)
  mocks.from.mockReturnValue(query)
  mocks.createAdmin.mockReturnValue({ from: mocks.from })
  mocks.maybeSingle.mockResolvedValue({ data: company, error: null })
})

describe('admin company notification email boundary', () => {
  it.each([401, 403])('refuses an unauthorised request with status %s before accessing company data', async status => {
    mocks.auth.mockResolvedValue({ error: NextResponse.json({ error: 'Not allowed' }, { status }) })
    expect((await send({ company_id: companyId, contact_email: 'hiring@example.com' })).status).toBe(status)
    expect(mocks.createAdmin).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('saves one normalized employer mailbox and returns the confirmed record', async () => {
    const response = await send({ company_id: companyId, contact_email: '  HIRING@EXAMPLE.COM  ' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, company })
    expect(mocks.from).toHaveBeenCalledWith('companies')
    expect(mocks.update).toHaveBeenCalledWith({ contact_email: 'hiring@example.com' })
    expect(mocks.eq).toHaveBeenCalledWith('id', companyId)
  })

  it.each(['', '   ', null])('explicitly clears the employer mailbox for %j', async contactEmail => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...company, contact_email: null }, error: null })
    const response = await send({ company_id: companyId, contact_email: contactEmail })
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ contact_email: null })
    expect(await response.json()).toMatchObject({ company: { contact_email: null } })
  })

  it('distinguishes a missing contact field from an explicit clear', async () => {
    expect((await send({ company_id: companyId })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([
    null, [], 'not an object', {}, { company_id: 'not-a-uuid', contact_email: 'hiring@example.com' },
    { company_id: companyId + '/other', contact_email: 'hiring@example.com' },
  ])('rejects a malformed request %j before a database write', async body => {
    expect((await send(body)).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON without changing company data', async () => {
    const response = await PATCH(new NextRequest('https://joblinkantigua.com/api/admin/companies', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{',
    }))
    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([
    'not-email', 'one@example.com,two@example.com', 'one@example.com;two@example.com',
    'Hiring Manager <hiring@example.com>', 'hiring@example.com\r\nBcc: other@example.com',
    'admin-company-example@joblinkantigua.com', 'ADMIN-COMPANY-123@JOBLINKANTIGUA.COM',
    'import+fixture-company@joblinkantigua.com',
    '.hiring@example.com', 'hiring..team@example.com', 'hiring@example',
    'a'.repeat(65) + '@example.com', 42, { email: 'hiring@example.com' }, ['hiring@example.com'],
  ])('rejects unsafe or malformed recipient %j', async contactEmail => {
    expect((await send({ company_id: companyId, contact_email: contactEmail })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the company does not exist', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await send({ company_id: companyId, contact_email: 'hiring@example.com' })).status).toBe(404)
  })

  it('returns a generic failure when persistence fails', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'private database diagnostic' } })
    const response = await send({ company_id: companyId, contact_email: 'hiring@example.com' })
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('private database diagnostic')
  })
})
