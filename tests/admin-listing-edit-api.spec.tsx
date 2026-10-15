// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), createAdmin: vi.fn(), from: vi.fn(), update: vi.fn(),
  eq: vi.fn(), select: vi.fn(), single: vi.fn(),
}))
vi.mock('@/lib/api-auth', () => ({ requireAdmin: mocks.auth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdmin }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/job-alert-matcher', () => ({ processJobAlerts: vi.fn() }))
vi.mock('next/server', async importOriginal => ({ ...(await importOriginal<object>()), after: vi.fn() }))
import { PATCH } from '@/app/api/admin/listings/[id]/route'

const id = '40b28447-7653-4646-bc21-b8f0653d9409'
const send = (body: unknown) => PATCH(new NextRequest(`https://joblinkantigua.com/api/admin/listings/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'admin' } })
  const query = { update: mocks.update, eq: mocks.eq, select: mocks.select, single: mocks.single }
  for (const mock of [mocks.update, mocks.eq, mocks.select]) mock.mockReturnValue(query)
  mocks.from.mockReturnValue(query)
  mocks.createAdmin.mockReturnValue({ from: mocks.from })
  mocks.single.mockResolvedValue({ data: { id, status: 'active', title: 'Line Cook' }, error: null })
})

describe('admin live listing edits', () => {
  it('updates the description of a live listing without touching status', async () => {
    const response = await send({ description: '  New description.  ' })
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ description: 'New description.' })
  })

  it('rejects unknown fields before any write', async () => {
    expect((await send({ description: 'x', company_id: 'other' })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects empty text and invalid enums', async () => {
    expect((await send({ description: '   ' })).status).toBe(400)
    expect((await send({ job_type: 'forever' })).status).toBe(400)
    expect((await send({ category: 'Not a category' })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('refuses non-admins', async () => {
    mocks.auth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await send({ description: 'x' })).status).toBe(403)
    expect(mocks.createAdmin).not.toHaveBeenCalled()
  })

  it('keeps status and featured updates working', async () => {
    expect((await send({ status: 'closed', is_featured: false })).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ status: 'closed', is_featured: false })
  })

  it('sets, clears and validates the closes_after deadline', async () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    expect((await send({ closes_after: future })).status).toBe(200)
    expect(mocks.update).toHaveBeenLastCalledWith({ closes_after: future })
    expect((await send({ closes_after: null })).status).toBe(200)
    expect(mocks.update).toHaveBeenLastCalledWith({ closes_after: null })
    mocks.update.mockClear()
    expect((await send({ closes_after: '2020-01-01' })).status).toBe(400)
    expect((await send({ closes_after: '2026-02-30' })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
