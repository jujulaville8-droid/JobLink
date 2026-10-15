import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const users = [
  { id: 's1', email: 'driver@example.test', role: 'seeker', created_at: '2026-10-01', email_verified: true, is_banned: false,
    seeker_profiles: [{ first_name: 'Dana', last_name: 'Driver', currently_employed: false, has_own_transport: true, availability: ['shifts', 'weekends'] }] },
  { id: 's2', email: 'walker@example.test', role: 'seeker', created_at: '2026-10-02', email_verified: true, is_banned: false,
    seeker_profiles: [{ first_name: 'Wes', last_name: 'Walker', currently_employed: true, has_own_transport: false, availability: ['full_time'] }] },
  { id: 's3', email: 'quiet@example.test', role: 'seeker', created_at: '2026-10-03', email_verified: true, is_banned: false,
    seeker_profiles: [{ first_name: 'Quinn', last_name: 'Quiet', currently_employed: null, has_own_transport: null, availability: null }] },
  { id: 'e1', email: 'boss@example.test', role: 'employer', created_at: '2026-10-04', email_verified: true, is_banned: false, companies: [{ company_name: 'Hotel' }] },
]
vi.mock('@/lib/auth', () => ({ requireRole: async () => ({ id: 'admin' }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => {
  const query = { select: () => query, not: () => query, order: () => query, ilike: () => query, eq: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: users, error: null }).then(resolve) }
  return { from: () => query }
} }))
import AdminUsersPage from '@/app/(dashboard)/admin/users/page'

afterEach(cleanup)
async function emails(params: Record<string, string>) {
  const { container } = render(await AdminUsersPage({ searchParams: Promise.resolve(params) }))
  return [...container.querySelectorAll('tbody tr')].map(row => row.querySelector('td')?.textContent)
}

it('lists everyone without profile filters', async () => {
  expect(await emails({})).toHaveLength(4)
})

it.each([
  [{ transport: 'yes' }, ['driver@example.test']],
  [{ transport: 'no' }, ['walker@example.test']],
  [{ transport: 'unknown' }, ['quiet@example.test']],
  [{ availability: 'weekends' }, ['driver@example.test']],
  [{ availability: 'full_time' }, ['walker@example.test']],
  [{ employed: 'no', transport: 'yes', availability: 'shifts' }, ['driver@example.test']],
  [{ employed: 'yes', transport: 'yes' }, []],
  [{ availability: 'nights' }, ['driver@example.test', 'walker@example.test', 'quiet@example.test', 'boss@example.test']],
])('filters seekers by %j', async (params, expected) => {
  const rows = await emails(params)
  if (expected.length) expect(rows).toEqual(expected)
  else expect(rows).toEqual(['No users found.'])
})
