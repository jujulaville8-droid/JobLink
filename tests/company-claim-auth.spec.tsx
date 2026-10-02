import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SignupPage from '@/app/(auth)/signup/page'
import EmployerLoginPage from '@/app/(auth)/employer/login/page'
import VerifyConfirmPage from '@/app/auth/verify-confirm/page'
import AuthRedirect from '@/components/AuthRedirect'
import ClaimCompanyButton from '@/components/claims/ClaimCompanyButton'
import { claimReturnTo, onboardingReturnTo, safeAuthReturnTo, withReturnTo } from '@/lib/claim-links'
import { containsClaimCredential } from '@/components/PrivacyAwareAnalytics'
const destination = `/claim/${'T'.repeat(43)}`
const api = vi.hoisted(() => ({ params: '', verified: false, signUp: vi.fn(), signInWithPassword: vi.fn(), signInWithOAuth: vi.fn(), getUser: vi.fn(), verifyOtp: vi.fn(), updateUser: vi.fn(), resend: vi.fn() }))
vi.mock('next/navigation', () => {
  const cache = new Map<string, URLSearchParams>()
  return { useSearchParams: () => { if (!cache.has(api.params)) cache.set(api.params, new URLSearchParams(api.params)); return cache.get(api.params)! }, usePathname: () => '/signup' }
})
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => ({ isAuthenticated: api.verified, isEmailVerified: api.verified, isLoading: false }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { ...api, getSession: async () => ({ data: { session: {} } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'employer', email_verified: true } }) }) }) }) }) }))
beforeEach(() => {
  api.params = `role=employer&returnTo=${encodeURIComponent(destination)}`
  api.verified = false
  api.signUp.mockResolvedValue({ data: { user: { id: 'employer', identities: [{}] } }, error: null })
  api.signInWithOAuth.mockResolvedValue({ data: {}, error: null })
  api.resend.mockResolvedValue({ error: null })
  api.updateUser.mockResolvedValue({ error: null })
  const user = { id: 'employer', email_confirmed_at: 'verified', user_metadata: { role: 'employer' } }
  api.signInWithPassword.mockResolvedValue({ data: { user }, error: null })
  api.getUser.mockResolvedValue({ data: { user } })
  window.history.replaceState({}, '', `/signup?${api.params}`)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })
it('accepts only complete claim paths for onboarding, blocking hostile redirect forms', () => {
  expect(claimReturnTo(destination)).toBe(destination)
  expect(onboardingReturnTo('/members')).toBe('/members')
  for (const value of ['//evil.example', '/\\evil.example', '/%5cevil.example', '/%2f/evil.example', '/\nevil.example', 'https://evil.example', '/claim/short', `${destination}?next=evil`, ['bad']]) expect(claimReturnTo(value)).toBeNull()
  for (const value of ['//evil.example', '/\\evil.example', '/%5cevil.example', '/%2f/evil.example', '/\nevil.example', 'https://evil.example']) expect(safeAuthReturnTo(value)).toBeNull()
  expect(safeAuthReturnTo('/jobs/example/apply')).toBe('/jobs/example/apply')
})
it('preserves claim through signup, resend, sign-in link and Google', async () => {
  const { container } = render(<SignupPage />)
  expect(screen.getByRole('link', { name: /^sign in$/i }).getAttribute('href')).toBe(withReturnTo('/employer/login', destination))
  fireEvent.click(screen.getByRole('button', { name: /google/i }))
  await waitFor(() => expect(api.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ options: { redirectTo: `${window.location.origin}${withReturnTo('/auth/callback?role=employer', destination)}` } })))
  // Remount to represent the email signup choice after canceling OAuth.
  cleanup()
  const emailForm = render(<SignupPage />)
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'owner@example.test' } })
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'Test-only-password' } })
  fireEvent.submit(emailForm.container.querySelector('form')!)
  await waitFor(() => expect(api.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { data: { role: 'employer', claim_return_to: destination }, emailRedirectTo: `${window.location.origin}${withReturnTo('/auth/verify-confirm?type=signup', destination)}` } })))
  expect(await screen.findByText(/No new company will be created/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }))
  await waitFor(() => expect(api.resend).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: `${window.location.origin}${withReturnTo('/auth/verify-confirm?type=signup', destination)}` } })))
  expect(container).toBeDefined()
})
it('employer password login and the auth wrapper both return to the claim', async () => {
  const { container } = render(<EmployerLoginPage />)
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'owner@example.test' } })
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'Test-only-password' } })
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(window.location.pathname).toBe(destination))
  cleanup(); window.history.replaceState({}, '', `/signup?${api.params}`)
  api.verified = true
  render(<AuthRedirect>Form</AuthRedirect>)
  await waitFor(() => expect(window.location.pathname).toBe(destination))
})
it('verification returns to claim before profile creation, including cross-device metadata fallback', async () => {
  api.params = '' // custom email template omitted the return URL
  api.getUser.mockResolvedValue({ data: { user: { id: 'employer', email_confirmed_at: 'verified', user_metadata: { role: 'employer', claim_return_to: destination } } } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ role: 'employer', hasProfile: false }) }))
  render(<VerifyConfirmPage />)
  await waitFor(() => expect(window.location.pathname).toBe(destination))
  expect(api.updateUser).toHaveBeenCalledWith({ data: { claim_return_to: null } })
})
it('blocks double submission and shows a friendly claim failure', async () => {
  let resolve!: (value: unknown) => void
  const fetch = vi.fn(() => new Promise(r => { resolve = r }))
  vi.stubGlobal('fetch', fetch)
  render(<ClaimCompanyButton token={'T'.repeat(43)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Claim this company' }))
  fireEvent.click(screen.getByRole('button', { name: 'Claiming…' }))
  expect(fetch).toHaveBeenCalledTimes(1)
  resolve({ ok: false, json: async () => ({ error: 'This claim link has expired.' }) })
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('expired')
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false)
})
it('excludes bearer URLs from analytics while retaining ordinary pages', () => {
  expect(containsClaimCredential(destination)).toBe(true)
  expect(containsClaimCredential(withReturnTo('/signup?role=employer', destination))).toBe(true)
  expect(containsClaimCredential('/jobs/example')).toBe(false)
})
