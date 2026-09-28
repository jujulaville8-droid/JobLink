// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn(), after: vi.fn(), auth: vi.fn() }))
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: mocks.after }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: () => ({ insert: mocks.insert }) }) }))
vi.mock('@/lib/api-auth', () => ({ requireAdmin: mocks.auth }))
import { POST } from '../src/app/api/employer-enquiries/route'
import { PATCH } from '../src/app/api/admin/employer-enquiries/[id]/route'

const request = { id: '11111111-1111-4111-8111-111111111111', company_name: 'Cafe Example', contact_name: 'Example Owner', email: 'owner@example.test', phone: '', job_title: 'Cook', details: 'Looking for a part-time cook on Saturdays.', contact_consent: true, website: '', source: 'website' }
const send = (body: unknown) => POST(new NextRequest('https://joblinkantigua.com/api/employer-enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.1' }, body: JSON.stringify(body) }))
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: [{ allowed: true }] }); mocks.insert.mockResolvedValue({ error: null }) })

it('persists a valid request before scheduling a notification', async () => {
  const response = await send(request)
  expect(response.status).toBe(201)
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'Cafe Example', contact_consent: true }))
  expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty('website')
  expect(mocks.after).toHaveBeenCalledOnce()
  expect(mocks.rpc.mock.calls[0][1].p_bucket).not.toContain('192.0.2.1')
})
it('rejects missing contact permission and invalid details before a database write', async () => {
  expect((await send({ ...request, contact_consent: false })).status).toBe(400)
  expect((await send({ ...request, details: 'short' })).status).toBe(400)
  expect((await send({ ...request, email: 'not-email' })).status).toBe(400)
  expect(mocks.insert).not.toHaveBeenCalled()
})
it('silently discards honeypot submissions without notifications', async () => {
  expect((await send({ ...request, website: 'spam' })).status).toBe(200)
  expect(mocks.insert).not.toHaveBeenCalled()
  expect(mocks.after).not.toHaveBeenCalled()
})
it('fails closed when rate limiting fails and refuses exhausted budgets', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Offline' } })
  expect((await send(request)).status).toBe(503)
  mocks.rpc.mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 120 }] })
  const response = await send(request)
  expect(response.status).toBe(429)
  expect(response.headers.get('Retry-After')).toBe('120')
  expect(mocks.insert).not.toHaveBeenCalled()
})
it('does not claim success on failed storage or notify duplicate submissions', async () => {
  mocks.insert.mockResolvedValue({ error: { code: '23505' } })
  expect((await send(request)).status).toBe(200)
  expect(mocks.after).not.toHaveBeenCalled()
  mocks.insert.mockResolvedValue({ error: { code: 'OTHER' } })
  expect((await send(request)).status).toBe(503)
  expect(mocks.after).not.toHaveBeenCalled()
})
it('rejects oversized requests and unauthorised admin changes', async () => {
  expect((await send({ ...request, details: 'a'.repeat(25000) })).status).toBe(413)
  mocks.auth.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
  expect((await PATCH(new NextRequest('https://joblinkantigua.com/api/admin/employer-enquiries/x', { method: 'PATCH' }), { params: Promise.resolve({ id: request.id }) })).status).toBe(403)
})
