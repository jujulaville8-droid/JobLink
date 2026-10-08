import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextRequest } from 'next/server';
import LoginPage from '@/app/(auth)/login/page';
import AuthRedirect from '@/components/AuthRedirect';
import { GET as authCallback } from '@/app/auth/callback/route';

const api = vi.hoisted(() => ({
  params: '',
  pathname: '/login',
  verified: false,
  role: 'seeker',
  password: vi.fn(),
  oauth: vi.fn(),
  userRow: vi.fn(),
  profile: vi.fn(),
  exchangeCode: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('next/navigation', () => {
  const cache = new Map<string, URLSearchParams>();
  return {
    useSearchParams: () => {
      if (!cache.has(api.params)) cache.set(api.params, new URLSearchParams(api.params));
      return cache.get(api.params)!;
    },
    usePathname: () => api.pathname,
  };
});
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ isAuthenticated: api.verified, isEmailVerified: api.verified, isLoading: false }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithPassword: api.password, signInWithOAuth: api.oauth, updateUser: api.updateUser },
    from: () => ({ select: () => ({ eq: () => ({ single: api.userRow }) }) }),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession: api.exchangeCode, getUser: api.getUser, updateUser: api.updateUser },
    from: () => ({ select: () => ({ eq: () => ({ single: api.profile }) }) }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: api.role }, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

const origin = window.location.origin;
const applicationPath = '/jobs/123e4567-e89b-42d3-a456-426614174000/apply';
const unsafeDestinations = ['https://evil.example', '//evil.example', '/\\evil.example', '/jobs\\apply'];

function openAuthPage(returnTo?: string, pathname = '/login') {
  api.params = returnTo === undefined ? '' : new URLSearchParams({ returnTo }).toString();
  api.pathname = pathname;
  window.history.replaceState({}, '', `${origin}${pathname}${api.params ? `?${api.params}` : ''}`);
}

async function submitPassword() {
  const { container } = render(<LoginPage />);
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'seeker@example.com' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'VeryStrongPass123!' } });
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(api.userRow).toHaveBeenCalled());
}

async function callbackDestination(returnTo?: string) {
  const params = new URLSearchParams({ code: 'test-code' });
  if (returnTo !== undefined) params.set('returnTo', returnTo);
  const response = await authCallback(new NextRequest(`${origin}/auth/callback?${params}`));
  return response.headers.get('location');
}

beforeEach(() => {
  api.verified = false;
  api.role = 'seeker';
  const user = { id: 'seeker-id', email: 'seeker@example.com', email_confirmed_at: 'today', user_metadata: { role: 'seeker' } };
  api.password.mockResolvedValue({ data: { user }, error: null });
  api.oauth.mockResolvedValue({ data: {}, error: null });
  api.userRow.mockResolvedValue({ data: { role: 'seeker', email_verified: true }, error: null });
  api.profile.mockResolvedValue({ data: { id: 'profile-id' }, error: null });
  api.exchangeCode.mockResolvedValue({ error: null });
  api.getUser.mockResolvedValue({ data: { user }, error: null });
  api.updateUser.mockResolvedValue({ error: null });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  openAuthPage();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('password login return destination', () => {
  it.each([applicationPath, `${applicationPath}?source=saved#details`, '/members'])('returns a verified user to %s', async (returnTo) => {
    openAuthPage(returnTo);
    await submitPassword();
    await waitFor(() => expect(window.location.href).toBe(`${origin}${returnTo}`));
  });

  it.each(unsafeDestinations)('rejects %s and uses the seeker default', async (returnTo) => {
    openAuthPage(returnTo);
    await submitPassword();
    await waitFor(() => expect(window.location.href).toBe(`${origin}/jobs`));
  });

  it.each(['seeker', 'employer', 'admin'])('retains the %s default without a return destination', async (role) => {
    api.userRow.mockResolvedValue({ data: { role, email_verified: true }, error: null });
    await submitPassword();
    await waitFor(() => expect(window.location.pathname).toBe(role === 'admin' ? '/dashboard' : '/jobs'));
  });
});

describe('Google login callback URL', () => {
  it('carries the safe application destination through OAuth', async () => {
    openAuthPage(applicationPath);
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /google/i }));
    await waitFor(() => expect(api.oauth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback?returnTo=${encodeURIComponent(applicationPath)}` },
    }));
  });

  it.each(unsafeDestinations)('omits unsafe return destination %s', async (returnTo) => {
    openAuthPage(returnTo);
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /google/i }));
    await waitFor(() => expect(api.oauth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback` },
    }));
  });
});

describe('authenticated auth-page redirect', () => {
  beforeEach(() => { api.verified = true; });

  it('preserves the application destination for an already verified session', async () => {
    openAuthPage(applicationPath);
    render(<AuthRedirect>Sign-in form</AuthRedirect>);
    await waitFor(() => expect(window.location.href).toBe(`${origin}${applicationPath}`));
  });

  it.each([undefined, ...unsafeDestinations])('falls back to dashboard for return destination %s', async (returnTo) => {
    openAuthPage(returnTo);
    render(<AuthRedirect>Sign-in form</AuthRedirect>);
    await waitFor(() => expect(window.location.href).toBe(`${origin}/dashboard`));
  });

  it('keeps the reset-password form available even with a safe return destination', () => {
    openAuthPage(applicationPath, '/reset-password');
    render(<AuthRedirect>Reset password form</AuthRedirect>);
    expect(screen.getByText('Reset password form')).toBeTruthy();
    expect(window.location.pathname).toBe('/reset-password');
  });
});

describe('OAuth callback return destination', () => {
  it('returns to the application even when a profile still needs creating', async () => {
    api.profile.mockResolvedValue({ data: null, error: null });
    expect(await callbackDestination(applicationPath)).toBe(`${origin}${applicationPath}`);
  });

  it.each(unsafeDestinations)('rejects %s and uses the profile destination', async (returnTo) => {
    api.profile.mockResolvedValue({ data: null, error: null });
    expect(await callbackDestination(returnTo)).toBe(`${origin}/profile`);
  });

  it.each([
    ['seeker', false, '/profile'],
    ['seeker', true, '/jobs'],
    ['employer', false, '/company-profile'],
    ['employer', true, '/post-job'],
    ['admin', false, '/dashboard'],
  ] as const)('retains the %s profile=%s default', async (role, hasProfile, destination) => {
    api.role = role;
    api.profile.mockResolvedValue({ data: hasProfile ? { id: 'profile-id' } : null, error: null });
    expect(await callbackDestination()).toBe(`${origin}${destination}`);
  });
});
