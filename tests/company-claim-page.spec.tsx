import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
const api = vi.hoisted(() => ({ from: vi.fn(), userFrom: vi.fn(), getUser: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: api.from }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: api.userFrom, auth: { getUser: api.getUser } }) }))
import ClaimPage from '@/app/claim/[token]/page'
const token = 'T'.repeat(43)
function result(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'or', 'order']) builder[method] = () => builder
  builder.maybeSingle = async () => ({ data, error })
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve)
  return builder
}
const valid = { company_id: 'company', claimed_at: null, expires_at: '9999-01-01T00:00:00Z' }
beforeEach(() => {
  api.getUser.mockResolvedValue({ data: { user: null } })
  api.from.mockImplementation((table: string) => result(table === 'company_claims' ? valid : table === 'companies' ? { id: 'company', company_name: 'Fixture Cafe', user_id: 'placeholder' } : table === 'users' ? { email: 'admin-company-123@joblinkantigua.com', role: 'employer', is_banned: false } : [{ id: 'job', title: 'Fixture vacancy', location: 'Test location' }]))
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
const show = async () => render(await ClaimPage({ params: Promise.resolve({ token }) }))
it('shows company, live jobs and employer signup/login links to anonymous visitors', async () => {
  await show()
  expect(screen.getByRole('heading', { name: 'Fixture Cafe' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Fixture vacancy' }).getAttribute('href')).toBe('/jobs/job')
  expect(screen.getByRole('link', { name: 'Claim this company' }).getAttribute('href')).toContain('/employer/signup?returnTo=%2Fclaim%2F')
})
it('returns friendly errors for unknown, expired, used and malformed links', async () => {
  for (const row of [null, { ...valid, expires_at: '2000-01-01' }, { ...valid, claimed_at: '2026-01-01' }]) {
    api.from.mockReturnValueOnce(result(row))
    await show()
    expect(screen.getByRole('status').textContent).toContain('invalid, has expired, or has already been used')
    expect(screen.queryByRole('button', { name: 'Claim this company' })).toBeNull()
    cleanup()
  }
  render(await ClaimPage({ params: Promise.resolve({ token: 'malformed' }) }))
  expect(screen.getByRole('status')).toBeTruthy()
})
it('explains seeker and existing-company restrictions without offering the claim action', async () => {
  api.getUser.mockResolvedValue({ data: { user: { id: 'user', email_confirmed_at: 'verified' } } })
  api.userFrom.mockReturnValueOnce(result({ role: 'seeker', email_verified: true }))
  await show()
  expect(screen.getByRole('status').textContent).toContain('job seeker')
  cleanup()
  api.userFrom.mockReturnValueOnce(result({ role: 'employer', email_verified: true })).mockReturnValueOnce(result({ id: 'different-company' }))
  await show()
  expect(screen.getByRole('status').textContent).toContain('already manage a company')
  expect(screen.queryByRole('button', { name: 'Claim this company' })).toBeNull()
})
it('requires verification and distinguishes load failures from empty jobs', async () => {
  api.getUser.mockResolvedValue({ data: { user: { id: 'user' } } })
  api.userFrom.mockReturnValueOnce(result({ role: 'employer', email_verified: false })).mockReturnValueOnce(result(null))
  await show()
  expect(screen.getByRole('link', { name: 'Verify your email to continue' }).getAttribute('href')).toContain('/verify-email?returnTo=')
  cleanup()
  api.from.mockReturnValueOnce(result(null, { message: 'database unavailable' }))
  await show()
  expect(screen.getByRole('status').textContent).toContain('couldn’t load')
})
