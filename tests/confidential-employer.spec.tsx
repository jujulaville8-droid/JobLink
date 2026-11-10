// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ requireUser: mocks.auth }))

import {
  CONFIDENTIAL_EMPLOYER_NAME,
  listingEmployerName,
  publicEmployerName,
} from '@/lib/confidential-employer'
import { GET as context } from '@/app/api/applications/[id]/context/route'

const employer = '11111111-1111-4111-8111-111111111111'
const seeker = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'

it('names an ordinary employer and masks a confidential one', () => {
  expect(publicEmployerName({ company_name: ' Open Cafe ', is_confidential: false })).toBe('Open Cafe')
  expect(publicEmployerName({ company_name: 'Secret Hotel', is_confidential: true })).toBe(CONFIDENTIAL_EMPLOYER_NAME)
  expect(publicEmployerName(null, 'An employer')).toBe('An employer')
})

it('labels a confidential listing even when row security returned no company', () => {
  expect(listingEmployerName(true, null, 'Company')).toBe(CONFIDENTIAL_EMPLOYER_NAME)
  expect(listingEmployerName(true, { company_name: 'Secret Hotel' })).toBe(CONFIDENTIAL_EMPLOYER_NAME)
  expect(listingEmployerName(false, { company_name: 'Open Cafe' })).toBe('Open Cafe')
  expect(listingEmployerName(false, null, 'Company')).toBe('Company')
})

/** The application as each side's own session returns it: row security drops the company for the applicant. */
function db(companyVisible: boolean) {
  const rows: Record<string, unknown> = {
    applications: {
      id: 'app',
      seeker_profiles: { user_id: seeker, first_name: 'Sam', last_name: 'Seeker' },
      job_listings: {
        title: 'Manager', company_id: 'company', is_confidential: true,
        companies: companyVisible ? { company_name: 'Secret Hotel' } : null,
      },
    },
    company_owners: { user_id: employer },
  }
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.single = async () => ({ data: rows[table] ?? null })
      chain.maybeSingle = async () => ({ data: rows[table] ?? null })
      return chain
    },
  }
}
const call = () => context(new NextRequest('https://example.invalid/api/applications/app/context'), { params: Promise.resolve({ id: 'app' }) })

beforeEach(() => vi.clearAllMocks())

it('never tells the applicant who a confidential employer is', async () => {
  mocks.auth.mockResolvedValue({ user: { id: seeker }, supabase: db(false) })
  const response = await call()
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body).toEqual({ job_title: 'Manager', company_name: CONFIDENTIAL_EMPLOYER_NAME, other_name: CONFIDENTIAL_EMPLOYER_NAME })
  expect(JSON.stringify(body)).not.toContain('Secret Hotel')
})

it('still shows the employer their own name and the applicant', async () => {
  mocks.auth.mockResolvedValue({ user: { id: employer }, supabase: db(true) })
  expect(await (await call()).json()).toEqual({ job_title: 'Manager', company_name: 'Secret Hotel', other_name: 'Sam Seeker' })
})

it('refuses anyone who is not part of the application', async () => {
  mocks.auth.mockResolvedValue({ user: { id: outsider }, supabase: db(false) })
  expect((await call()).status).toBe(403)
})

it('keeps the database rules that make the masking hold', () => {
  const sql = readFileSync('supabase/migrations/20261110010000_confidential_employers.sql', 'utf8')
  // Company rows of confidential employers are for the owner and admins only.
  expect(sql).toMatch(/create policy "Companies are publicly viewable"[\s\S]*not is_confidential\s+or user_id = \(select auth\.uid\(\)\)\s+or \(select public\.is_admin_user\(\)\)/)
  // The owner lookup exposes ids only, and not to signed-out visitors.
  expect(sql).toMatch(/as select id, user_id from public\.companies;/)
  expect(sql).toMatch(/revoke all on public\.company_owners from public, anon, authenticated;\s+grant select on public\.company_owners to authenticated;/)
  // Both messaging functions bypass row security, so each must mask by hand.
  expect(sql.match(/CASE WHEN co\.is_confidential THEN 'Confidential employer'/g)).toHaveLength(2)
  expect(sql.match(/CASE WHEN co_job\.is_confidential AND co_job\.user_id <> p_user_id/g)).toHaveLength(2)
})
