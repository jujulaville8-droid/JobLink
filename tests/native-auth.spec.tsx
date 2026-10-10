// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ header: vi.fn(), cookies: vi.fn(), native: vi.fn(), browser: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: mocks.header }), cookies: mocks.cookies }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.native }))
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.browser }))
import { createClient } from '../src/lib/supabase/server'
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key'); mocks.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() }) })
afterEach(() => vi.unstubAllEnvs())
it('keeps native credentials request-scoped and never reads browser cookies with a token', async () => {
  mocks.header.mockReturnValue('Bearer native-user-token')
  await createClient()
  expect(mocks.cookies).not.toHaveBeenCalled()
  expect(mocks.browser).not.toHaveBeenCalled()
  expect(mocks.native).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
    global: { headers: { Authorization: 'Bearer native-user-token' } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
})
it('preserves existing cookie authentication when no Authorization header is supplied', async () => {
  mocks.header.mockReturnValue(null)
  await createClient()
  expect(mocks.native).not.toHaveBeenCalled()
  expect(mocks.browser).toHaveBeenCalledOnce()
})
it('does not fall back to another signed-in identity for invalid Authorization', async () => {
  mocks.header.mockReturnValue('Bearer invalid')
  await createClient()
  expect(mocks.cookies).not.toHaveBeenCalled()
})
