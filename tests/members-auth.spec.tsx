import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignupPage from '@/app/(auth)/signup/page';
import AuthRedirect from '@/components/AuthRedirect';
import VerifyConfirmPage from '@/app/auth/verify-confirm/page';

const api = vi.hoisted(() => ({ params: 'role=employer&returnTo=%2Fmembers', verified: false, signup: vi.fn(), oauth: vi.fn(), getUser: vi.fn() }));
vi.mock('next/navigation', () => {
  const cache = new Map<string, URLSearchParams>();
  return { useSearchParams: () => { if (!cache.has(api.params)) cache.set(api.params, new URLSearchParams(api.params)); return cache.get(api.params)!; }, usePathname: () => '/signup' };
});
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => ({ isAuthenticated: api.verified, isEmailVerified: api.verified, isLoading: false }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp: api.signup, signInWithOAuth: api.oauth, getUser: api.getUser, getSession: async () => ({ data: { session: { user: { id: 'e' } } } }) } }) }));
beforeEach(() => {
  api.params = 'role=employer&returnTo=%2Fmembers';
  api.verified = false;
  api.signup.mockResolvedValue({ data: { user: { id: 'e', identities: [{}] }, session: null }, error: null });
  api.oauth.mockResolvedValue({ data: {}, error: null });
  api.getUser.mockResolvedValue({ data: { user: { id: 'e', email_confirmed_at: 'today', user_metadata: { role: 'employer' } } }, error: null });
  window.history.replaceState({}, '', '/signup?role=employer&returnTo=%2Fmembers');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('keeps Members as the destination in the signup sign-in link and Google callback', async () => {
  render(<SignupPage />);
  expect(screen.getByRole('link', { name: /^sign in$/i }).getAttribute('href')).toBe('/login?returnTo=%2Fmembers');
  fireEvent.click(screen.getByRole('button', { name: /google/i }));
  await waitFor(() => expect(api.oauth).toHaveBeenCalledWith(expect.objectContaining({ options: { redirectTo: `${window.location.origin}/auth/callback?role=employer&returnTo=%2Fmembers` } })));
});

it('keeps Members in the email verification URL for a new employer', async () => {
  const { container } = render(<SignupPage />);
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'owner@example.com' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'VeryStrongPass123!' } });
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(api.signup).toHaveBeenCalledWith(expect.objectContaining({ options: { data: { role: 'employer' }, emailRedirectTo: `${window.location.origin}/auth/verify-confirm?type=signup&returnTo=%2Fmembers` } })));
});

it('does not let the auth wrapper send Members sign-ins to the dashboard', async () => {
  api.verified = true;
  render(<AuthRedirect>Form</AuthRedirect>);
  await waitFor(() => expect(window.location.pathname).toBe('/members'));
});

it('returns a newly verified employer to Members even without a company profile', async () => {
  api.params = 'returnTo=%2Fmembers';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ role: 'employer', hasProfile: false }) }));
  render(<VerifyConfirmPage />);
  await waitFor(() => expect(window.location.pathname).toBe('/members'));
});

it('does not accept arbitrary return URLs on signup', () => {
  api.params = 'role=employer&returnTo=https://evil.example';
  render(<SignupPage />);
  expect(screen.getByRole('link', { name: /^sign in$/i }).getAttribute('href')).toBe('/employer/login');
});
