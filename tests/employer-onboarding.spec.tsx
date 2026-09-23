import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanyProfilePage from '@/app/(dashboard)/company-profile/page';
import SignupPage from '@/app/(auth)/signup/page';
import PostJobPage from '@/app/(dashboard)/post-job/page';

const api = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), load: vi.fn(), save: vi.fn(),
  signup: vi.fn(), resend: vi.fn(), oauth: vi.fn(), payload: vi.fn(),
  role: 'employer',
}));
vi.mock('next/navigation', () => {
  const router = { push: api.push, replace: api.replace };
  return { useRouter: () => router, useSearchParams: () => new URLSearchParams({ role: api.role }) };
});
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'employer-1', email: 'owner@example.com' } }, error: null }),
      signUp: api.signup, resend: api.resend, signInWithOAuth: api.oauth,
    },
    from: (table: string) => {
      let writing = false;
      const query = {
        select: () => query, eq: () => query,
        insert: (value: unknown) => { writing = true; api.payload(value); return query; },
        update: (value: unknown) => { writing = true; api.payload(value); return query; },
        single: () => table === 'users' ? Promise.resolve({ data: { id: 'employer-1' }, error: null }) : writing ? api.save() : api.load(),
        maybeSingle: () => api.load(),
        then: (resolve: (value: unknown) => unknown) => api.save().then(resolve),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  api.role = 'employer';
  api.load.mockResolvedValue({ data: null, error: null });
  api.save.mockResolvedValue({ data: { id: 'company-1' }, error: null });
  api.signup.mockResolvedValue({ data: { user: { id: 'employer-1', identities: [{}] }, session: null }, error: null });
  api.resend.mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);

describe('company setup', () => {
  it('routes returning employers with no company back to setup', async () => {
    render(<PostJobPage />);
    await waitFor(() => expect(api.replace).toHaveBeenCalledWith('/company-profile'));
  });

  it('does not treat a company lookup error as a missing company', async () => {
    api.load.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    render(<PostJobPage />);
    await screen.findByText(/could not load your company/i);
    expect(api.replace).not.toHaveBeenCalled();
  });
  it('lets a new employer continue with only a company name', async () => {
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.type(await screen.findByLabelText(/company name/i), '  Island Studio  ');
    await user.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(api.push).toHaveBeenCalledWith('/post-job'));
    expect(api.payload).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'Island Studio', user_id: 'employer-1' }));
    expect(screen.queryByRole('link', { name: /upgrade/i })).toBeNull();
  });

  it('focuses the missing required field and does not save', async () => {
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    const name = await screen.findByLabelText(/company name/i);
    await user.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(api.payload).not.toHaveBeenCalled();
  });

  it('normalizes a bare website domain when saving', async () => {
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.type(await screen.findByLabelText(/company name/i), 'Island Studio');
    await user.click(screen.getByText(/logo and more details/i));
    await user.type(screen.getByLabelText(/website/i), 'www.example.com');
    await user.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(api.payload).toHaveBeenCalledWith(expect.objectContaining({ website: 'https://www.example.com/' })));
  });

  it('rejects unsafe website protocols without losing entered details', async () => {
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.type(await screen.findByLabelText(/company name/i), 'Island Studio');
    await user.click(screen.getByText(/logo and more details/i));
    await user.type(screen.getByLabelText(/website/i), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: /save and continue/i }));
    expect(screen.getByLabelText(/website/i).getAttribute('aria-invalid')).toBe('true');
    expect(api.payload).not.toHaveBeenCalled();
  });

  it('offers retry instead of an empty creation form when loading fails', async () => {
    api.load.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.click(await screen.findByRole('button', { name: /try again/i }));
    expect(await screen.findByLabelText(/company name/i)).toBeTruthy();
  });

  it('keeps data and allows retry after a rejected save', async () => {
    api.save.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.type(await screen.findByLabelText(/company name/i), 'Island Studio');
    await user.click(screen.getByRole('button', { name: /save and continue/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(api.push).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/company name/i) as HTMLInputElement).value).toBe('Island Studio');
    await user.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(api.push).toHaveBeenCalledWith('/post-job'));
  });

  it('saves an existing profile without redirecting it into onboarding', async () => {
    api.load.mockResolvedValue({ data: { id: 'company-1', company_name: 'Island Studio' }, error: null });
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.click(await screen.findByRole('button', { name: /^save profile$/i }));
    await screen.findByRole('status');
    expect(api.push).not.toHaveBeenCalled();
  });

  it('freezes edits and prevents duplicate writes while a save is pending', async () => {
    let finishSave!: (value: unknown) => void;
    api.save.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    const name = await screen.findByLabelText(/company name/i);
    await user.type(name, 'Island Studio');
    await user.click(screen.getByRole('button', { name: /save and continue/i }));
    const saving = screen.getByRole('button', { name: /saving/i }) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    await user.type(name, ' should not change');
    await user.click(saving);
    expect((name as HTMLInputElement).value).toBe('Island Studio');
    expect(api.payload).toHaveBeenCalledTimes(1);
    finishSave({ data: { id: 'company-1' }, error: null });
    await waitFor(() => expect(api.push).toHaveBeenCalledWith('/post-job'));
  });

  it('does not announce success or continue when the database rejects a save', async () => {
    api.save.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    const user = userEvent.setup();
    render(<CompanyProfilePage />);
    await user.type(await screen.findByLabelText(/company name/i), 'Island Studio');
    await user.click(screen.getByRole('button', { name: /save and continue/i }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('status')).toBeNull();
    expect(api.push).not.toHaveBeenCalled();
  });
});

describe('employer account signup', () => {
  async function fillAccount() {
    const user = userEvent.setup();
    render(<SignupPage />);
    await user.type(screen.getByLabelText(/work email/i), 'owner@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secure-password');
    return user;
  }

  it('supports one password field with a visibility toggle for employers', async () => {
    const user = await fillAccount();
    expect(screen.queryByLabelText(/confirm password/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(screen.getByLabelText(/^password$/i).getAttribute('type')).toBe('text');
    await user.click(screen.getByRole('button', { name: /create employer account/i }));
    await screen.findByRole('button', { name: /resend verification email/i });
    expect(api.signup).toHaveBeenCalledWith(expect.objectContaining({ email: 'owner@example.com', options: expect.objectContaining({ data: { role: 'employer' } }) }));
  });

  it('recovers from a network failure without leaving signup disabled', async () => {
    api.signup.mockRejectedValueOnce(new Error('offline'));
    const user = await fillAccount();
    await user.click(screen.getByRole('button', { name: /create employer account/i }));
    await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: /create employer account/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('resends verification with the same onboarding redirect', async () => {
    const user = await fillAccount();
    await user.click(screen.getByRole('button', { name: /create employer account/i }));
    await user.click(await screen.findByRole('button', { name: /resend verification email/i }));
    await waitFor(() => expect(api.resend).toHaveBeenCalledWith({ type: 'signup', email: 'owner@example.com', options: { emailRedirectTo: expect.stringContaining('/auth/verify-confirm?type=signup') } }));
    expect((screen.getByRole('button', { name: /resend/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not accept unsupported roles from the URL', () => {
    api.role = 'admin';
    render(<SignupPage />);
    expect(screen.queryByLabelText(/^password$/i)).toBeNull();
  });

  it('keeps password confirmation for job seekers', async () => {
    api.role = 'seeker';
    const user = userEvent.setup();
    render(<SignupPage />);
    await user.type(screen.getByLabelText(/^email address$/i), 'seeker@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secure-password');
    await user.type(screen.getByLabelText(/confirm password/i), 'different-password');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));
    await screen.findByRole('alert');
    expect(api.signup).not.toHaveBeenCalled();
  });

  it('recovers when Google sign-in cannot connect', async () => {
    api.oauth.mockRejectedValueOnce(new Error('offline'));
    const user = await fillAccount();
    await user.click(screen.getByRole('button', { name: /sign up with google/i }));
    await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: /sign up with google/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
