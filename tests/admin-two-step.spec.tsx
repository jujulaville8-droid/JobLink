// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({ level: 'aal1' as string | null, admin: true, mfaThrows: false }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1', email_confirmed_at: 'x' } }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: async () => {
        if (session.mfaThrows) throw new Error('unavailable')
        return { data: { currentLevel: session.level, nextLevel: 'aal2' }, error: null }
      } },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: session.admin, is_banned: false, email_verified: true }, error: null }) }) }) }),
  }),
}))
import { requireAdmin, requireAdminTwoStep } from '@/lib/api-auth'

const status = async (result: Awaited<ReturnType<typeof requireAdmin>>) => ('error' in result ? result.error.status : 200)
afterEach(() => { vi.unstubAllEnvs(); Object.assign(session, { level: 'aal1', admin: true, mfaThrows: false }) })

describe('two-step login for admins', () => {
  it('routes that handle verification documents always need it, whatever the rollout switch says', async () => {
    expect(await status(await requireAdminTwoStep())).toBe(403)
    const refused = await requireAdminTwoStep()
    expect('error' in refused && (await refused.error.json()).code).toBe('MFA_REQUIRED')
    session.level = 'aal2'
    expect(await status(await requireAdminTwoStep())).toBe(200)
  })

  it('fails closed when the assurance level cannot be read', async () => {
    session.mfaThrows = true
    expect(await status(await requireAdminTwoStep())).toBe(403)
    session.mfaThrows = false
    session.level = null
    expect(await status(await requireAdminTwoStep())).toBe(403)
  })

  it('a second factor does not make a non-admin an admin', async () => {
    session.admin = false
    session.level = 'aal2'
    expect(await status(await requireAdminTwoStep())).toBe(403)
    expect(await status(await requireAdmin())).toBe(403)
  })

  it('every other admin route needs it once ADMIN_MFA_ENFORCED is on, and not before', async () => {
    expect(await status(await requireAdmin())).toBe(200)
    vi.stubEnv('ADMIN_MFA_ENFORCED', 'true')
    expect(await status(await requireAdmin())).toBe(403)
    session.level = 'aal2'
    expect(await status(await requireAdmin())).toBe(200)
  })
})
