import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VerifyEmailPage from '@/app/verify-email/page';
const api = vi.hoisted(() => ({ session: true, verified: false, resend: vi.fn(), updateUser: vi.fn() }));
const application = '/jobs/123e4567-e89b-42d3-a456-426614174000/apply';
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: api.session ? {} : null } }),
    getUser: async () => ({ data: { user: { id: 'synthetic-seeker', email: 'seeker@example.test', email_confirmed_at: api.verified ? 'verified' : null, user_metadata: { role: 'seeker' } } } }),
    resend: api.resend, updateUser: api.updateUser,
  },
  from: (table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({ data: table === 'users' ? { role: 'seeker', email_verified: api.verified } : null }) }) }) }),
}) }));
beforeEach(() => {
  api.session = true; api.verified = false;
  api.resend.mockResolvedValue({ error: null }); api.updateUser.mockResolvedValue({ error: null });
  window.history.replaceState({}, '', `/verify-email?returnTo=${encodeURIComponent(application)}`);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('keeps the validated application destination in a resent verification email', async () => {
  render(<VerifyEmailPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Resend Verification Email' }));
  await waitFor(() => expect(api.resend).toHaveBeenCalledWith({
    type: 'signup', email: 'seeker@example.test',
    options: { emailRedirectTo: `${window.location.origin}/auth/verify-confirm?type=signup&returnTo=${encodeURIComponent(application)}` },
  }));
});
it('returns a newly verified account to its application even without a profile yet', async () => {
  api.verified = true;
  render(<VerifyEmailPage />);
  await waitFor(() => expect(window.location.pathname).toBe(application));
});
it('preserves application context when an expired session needs sign-in', async () => {
  api.session = false;
  render(<VerifyEmailPage />);
  fireEvent.click(await screen.findByRole('link', { name: 'Go to Sign In' }));
  expect(window.location.pathname).toBe('/login');
  expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(application);
});
it('rejects an external destination while resending verification', async () => {
  window.history.replaceState({}, '', '/verify-email?returnTo=%2F%252fevil.example');
  render(<VerifyEmailPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Resend Verification Email' }));
  await waitFor(() => expect(api.resend).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: `${window.location.origin}/auth/verify-confirm?type=signup` } })));
});
