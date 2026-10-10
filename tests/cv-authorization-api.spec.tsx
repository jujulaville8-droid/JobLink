// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), sessionAccount: vi.fn(), createAdmin: vi.fn(), from: vi.fn(),
  storageFrom: vi.fn(), sign: vi.fn(), fetchCv: vi.fn(), document: vi.fn(), render: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.sessionAccount }) }) }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdmin }))
vi.mock('@/lib/cv-helpers', () => ({ fetchFullCv: mocks.fetchCv }))
vi.mock('@/lib/cv-pdf', () => ({
  createCvDocument: mocks.document,
  THEME_LIST: [{ id: 'classic' }, { id: 'studio' }],
}))
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: mocks.render }))
import { GET as download } from '@/app/api/cv-download/route'
import { GET as exportCv } from '@/app/api/cv/export/route'

const callerId = 'caller-user'
const targetId = 'candidate-user'
const profile = { id: 'candidate-profile', user_id: targetId, cv_url: 'candidate/resume.pdf' }
const company = { id: 'caller-company', is_pro: false, pro_expires_at: null }
const cv = { contact: { first_name: 'Example', last_name: 'Candidate' } }
const diagnostic = { message: 'Internal lookup failure' }
type QueryResult = { data: unknown; error: unknown }
const results: Record<string, QueryResult> = {}
const queries = new Map<string, ReturnType<typeof createQuery>>()

function createQuery(table: string) {
  const query = {
    select: vi.fn(), eq: vi.fn(), limit: vi.fn(),
    single: vi.fn(async () => results[table]),
    maybeSingle: vi.fn(async () => results[table]),
  }
  for (const method of [query.select, query.eq, query.limit]) method.mockReturnValue(query)
  return query
}

beforeEach(() => {
  vi.resetAllMocks()
  queries.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2030-01-01T12:00:00Z'))
  mocks.getUser.mockResolvedValue({ data: { user: { id: callerId } }, error: null })
  mocks.sessionAccount.mockResolvedValue({ data: { is_banned: false, is_admin: false }, error: null })
  Object.assign(results, {
    users: { data: { role: 'seeker', is_admin: false }, error: null },
    seeker_profiles: { data: profile, error: null },
    companies: { data: company, error: null },
    applications: { data: null, error: null },
  })
  mocks.from.mockImplementation((table: string) => {
    if (!(table in results)) throw new Error(`Unexpected table: ${table}`)
    const query = createQuery(table)
    queries.set(table, query)
    return query
  })
  mocks.storageFrom.mockReturnValue({ createSignedUrl: mocks.sign })
  mocks.createAdmin.mockReturnValue({ from: mocks.from, storage: { from: mocks.storageFrom } })
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.example/resume' }, error: null })
  mocks.fetchCv.mockResolvedValue(cv)
  mocks.document.mockReturnValue('pdf-document')
  mocks.render.mockResolvedValue(Buffer.from('%PDF-synthetic-test'))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const routes = [
  {
    name: 'uploaded CV download', success: 307,
    request: () => download(new NextRequest(`https://app.example/api/cv-download?profileId=${profile.id}`)),
  },
  {
    name: 'generated CV export', success: 200,
    request: () => exportCv(new NextRequest(`https://app.example/api/cv/export?userId=${targetId}`)),
  },
]
function expectNoDelivery() {
  expect(mocks.storageFrom).not.toHaveBeenCalled()
  expect(mocks.sign).not.toHaveBeenCalled()
  expect(mocks.fetchCv).not.toHaveBeenCalled()
  expect(mocks.document).not.toHaveBeenCalled()
  expect(mocks.render).not.toHaveBeenCalled()
}
async function expectForbidden(request: () => Promise<Response>) {
  const response = await request()
  expect(response.status).toBe(403)
  expect(await response.json()).toEqual({ error: 'Forbidden' })
  expectNoDelivery()
}

for (const route of routes) {
  describe(route.name, () => {
    it('rejects a role-only admin before cross-owner profile reads, signing or export', async () => {
      results.users.data = { role: 'admin', is_admin: false }
      await expectForbidden(route.request)
      expect(mocks.from.mock.calls).toEqual([['users']])
      expect(queries.get('users')?.eq).toHaveBeenCalledWith('id', callerId)
    })

    it.each([null, undefined, 'true', 1])('does not treat a non-boolean admin flag (%j) as authority', async flag => {
      results.users.data = { role: 'admin', is_admin: flag }
      await expectForbidden(route.request)
      expect(mocks.from.mock.calls).toEqual([['users']])
    })

    it.each([
      { role: 'unexpected', is_admin: false }, { role: null, is_admin: false }, {}, [],
    ])('rejects an unexpected account shape before a target read: %j', async account => {
      results.users.data = account
      await expectForbidden(route.request)
      expect(mocks.from.mock.calls).toEqual([['users']])
    })

    it.each([
      { data: null, error: null },
      { data: null, error: diagnostic },
      { data: { role: 'admin', is_admin: true }, error: diagnostic },
      { data: { role: 'employer', is_admin: false }, error: diagnostic },
    ])('fails closed on a missing or failed account lookup: %j', async result => {
      results.users = result
      await expectForbidden(route.request)
      expect(mocks.from.mock.calls).toEqual([['users']])
    })

    it.each(['admin', 'seeker', 'employer'])('preserves genuine server-admin access in the %s role', async role => {
      results.users.data = { role, is_admin: true }
      expect((await route.request()).status).toBe(route.success)
      expect(mocks.from).not.toHaveBeenCalledWith('companies')
      expect(mocks.from).not.toHaveBeenCalledWith('applications')
    })

    it('refuses a seeker accessing another owner', async () => {
      await expectForbidden(route.request)
      expect(mocks.from).not.toHaveBeenCalledWith('companies')
    })

    it.each([
      { is_pro: true, pro_expires_at: null },
      { is_pro: true, pro_expires_at: '2030-01-02T12:00:00Z' },
    ])('preserves active premium-employer access: %j', async subscription => {
      results.users.data = { role: 'employer', is_admin: false }
      results.companies.data = { ...company, ...subscription }
      expect((await route.request()).status).toBe(route.success)
      expect(queries.get('companies')?.eq).toHaveBeenCalledWith('user_id', callerId)
      expect(mocks.from).not.toHaveBeenCalledWith('applications')
    })

    const inactiveSubscriptions = [
      { is_pro: false, pro_expires_at: null },
      { is_pro: true, pro_expires_at: '2029-12-31T12:00:00Z' },
      { is_pro: true, pro_expires_at: '2030-01-01T12:00:00Z' },
      { is_pro: true, pro_expires_at: 'invalid-date' },
    ]
    it.each(inactiveSubscriptions)('requires an application for a non-active premium employer: %j', async subscription => {
      results.users.data = { role: 'employer', is_admin: false }
      results.companies.data = { ...company, ...subscription }
      await expectForbidden(route.request)
      expect(queries.get('applications')?.eq).toHaveBeenCalledWith('job_listings.company_id', company.id)
    })

    it.each(inactiveSubscriptions)('preserves application-related employer access: %j', async subscription => {
      results.users.data = { role: 'employer', is_admin: false }
      results.companies.data = { ...company, ...subscription }
      results.applications.data = { id: 'application' }
      expect((await route.request()).status).toBe(route.success)
      const relationship = queries.get('applications')
      expect(relationship?.eq).toHaveBeenCalledWith('job_listings.company_id', company.id)
      expect(relationship?.limit).toHaveBeenCalledWith(1)
      if (route.name === 'uploaded CV download') {
        expect(relationship?.select).toHaveBeenCalledWith('id, job_listings!inner(company_id)')
        expect(relationship?.eq).toHaveBeenCalledWith('seeker_id', profile.id)
      } else {
        expect(relationship?.select).toHaveBeenCalledWith('id, seeker_profiles!inner(user_id), job_listings!inner(company_id)')
        expect(relationship?.eq).toHaveBeenCalledWith('seeker_profiles.user_id', targetId)
      }
    })

    it.each([
      { data: null, error: null },
      { data: null, error: diagnostic },
      { data: { ...company, is_pro: true }, error: diagnostic },
    ])('fails closed on a missing or failed company lookup: %j', async result => {
      results.users.data = { role: 'employer', is_admin: false }
      results.companies = result
      await expectForbidden(route.request)
      expect(mocks.from).not.toHaveBeenCalledWith('applications')
    })

    it.each([
      { data: null, error: diagnostic },
      { data: { id: 'application' }, error: diagnostic },
    ])('fails closed on a failed relationship lookup: %j', async result => {
      results.users.data = { role: 'employer', is_admin: false }
      results.applications = result
      await expectForbidden(route.request)
    })

    it.each([
      { data: { user: null }, error: null },
      { data: { user: { id: callerId } }, error: diagnostic },
    ])('preserves the authentication gate: %j', async authResult => {
      mocks.getUser.mockResolvedValue(authResult)
      expect((await route.request()).status).toBe(401)
      expect(mocks.createAdmin).not.toHaveBeenCalled()
      expectNoDelivery()
    })

    it('preserves the ban gate even for a server-admin account', async () => {
      mocks.sessionAccount.mockResolvedValue({ data: { is_banned: true, is_admin: true }, error: null })
      results.users.data = { role: 'admin', is_admin: true }
      const response = await route.request()
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'ACCOUNT_BANNED' })
      expect(mocks.createAdmin).not.toHaveBeenCalled()
      expectNoDelivery()
    })
  })
}

describe('download behavior', () => {
  it('preserves owner access and the existing storage bucket, expiration and download flag', async () => {
    results.seeker_profiles.data = { ...profile, user_id: callerId }
    const response = await routes[0].request()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://storage.example/resume')
    expect(queries.get('seeker_profiles')?.eq).toHaveBeenCalledWith('id', profile.id)
    expect(mocks.storageFrom).toHaveBeenCalledWith('cvs')
    expect(mocks.sign).toHaveBeenCalledWith(profile.cv_url, 3600, { download: true })
    expect(mocks.from).not.toHaveBeenCalledWith('companies')
  })

  it('requires profileId before any account or storage read', async () => {
    expect((await download(new NextRequest('https://app.example/api/cv-download'))).status).toBe(400)
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.createAdmin).not.toHaveBeenCalled()
    expectNoDelivery()
  })

  it.each([
    { data: null, error: null },
    { data: { ...profile, cv_url: null }, error: null },
    { data: null, error: diagnostic },
    { data: profile, error: diagnostic },
  ])('does not sign a missing or failed profile: %j', async result => {
    results.users.data = { role: 'seeker', is_admin: true }
    results.seeker_profiles = result
    expect((await routes[0].request()).status).toBe(404)
    expectNoDelivery()
  })

  it.each([
    { data: null, error: diagnostic }, { data: {}, error: null },
  ])('preserves a generic storage-signing failure: %j', async result => {
    results.users.data = { role: 'seeker', is_admin: true }
    mocks.sign.mockResolvedValue(result)
    const response = await routes[0].request()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to generate download link' })
  })
})

describe('export behavior', () => {
  it.each(['', `?userId=${callerId}`])('keeps self export on the session client: %s', async suffix => {
    const response = await exportCv(new NextRequest(`https://app.example/api/cv/export${suffix}`))
    expect(response.status).toBe(200)
    expect(mocks.createAdmin).not.toHaveBeenCalled()
    expect(mocks.fetchCv).toHaveBeenCalledWith(callerId, false)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="Example_Candidate_Resume.pdf"')
    expect(await response.text()).toBe('%PDF-synthetic-test')
  })

  it.each([['studio', 'studio'], ['unrecognized', 'classic']])('preserves theme selection for an authorized cross-owner export: %s', async (input, expected) => {
    results.users.data = { role: 'employer', is_admin: true }
    const response = await exportCv(new NextRequest(`https://app.example/api/cv/export?userId=${targetId}&theme=${input}`))
    expect(response.status).toBe(200)
    expect(mocks.fetchCv).toHaveBeenCalledWith(targetId, true)
    expect(mocks.document).toHaveBeenCalledWith(cv, expected)
  })

  it('preserves 404 for an authorized request with no saved resume', async () => {
    results.users.data = { role: 'seeker', is_admin: true }
    mocks.fetchCv.mockResolvedValue(null)
    expect((await routes[1].request()).status).toBe(404)
    expect(mocks.render).not.toHaveBeenCalled()
  })

  it('preserves a generic PDF rendering failure', async () => {
    results.users.data = { role: 'seeker', is_admin: true }
    mocks.render.mockRejectedValue(new Error('Synthetic renderer failure'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await routes[1].request()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to generate PDF' })
  })
})
