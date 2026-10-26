import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ComponentProps } from 'react';
import CompanyProfilePage from '@/app/(dashboard)/company-profile/page';
import SignupPage from '@/app/(auth)/signup/page';
import PostJobPage from '@/app/(dashboard)/post-job/page';

const api = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), load: vi.fn(), save: vi.fn(),
  signup: vi.fn(), resend: vi.fn(), oauth: vi.fn(), payload: vi.fn(),
  role: 'employer', editId: null as string | null, listing: vi.fn(),
  count: vi.fn(),
}));
// Exercise form behavior without Happy DOM's canceled animation promises.
vi.mock('motion/react', () => ({ motion: {
  div: ({ children, ...props }: ComponentProps<'div'> & Record<string, unknown>) => {
    for (const key of ['variants', 'initial', 'animate', 'transition']) delete props[key];
    return createElement('div', props, children);
  },
} }));
vi.mock('next/navigation', () => {
  const router = { push: api.push, replace: api.replace };
  return { useRouter: () => router, useSearchParams: () => new URLSearchParams({ role: api.role, ...(api.editId ? { edit: api.editId } : {}) }) };
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
        select: () => query, eq: () => query, in: () => query,
        insert: (value: unknown) => { writing = true; api.payload(value); return query; },
        update: (value: unknown) => { writing = true; api.payload(value); return query; },
        single: () => table === 'users' ? Promise.resolve({ data: { id: 'employer-1' }, error: null }) : writing ? api.save() : table === 'job_listings' ? api.listing() : api.load(),
        maybeSingle: () => api.load(),
        then: (resolve: (value: unknown) => unknown) => (table === 'job_listings' && !writing ? api.count() : api.save()).then(resolve),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  api.role = 'employer';
  api.editId = null;
  api.count.mockResolvedValue({ count: 0, error: null });
  api.load.mockResolvedValue({ data: null, error: null });
  api.save.mockResolvedValue({ data: { id: 'company-1' }, error: null });
  api.signup.mockResolvedValue({ data: { user: { id: 'employer-1', identities: [{}] }, session: null }, error: null });
  api.resend.mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);

describe('post-job card preview', () => {
  beforeEach(() => {
    api.load.mockResolvedValue({ data: { id: 'company-1', company_name: 'Island Studio', location: 'English Harbour', industry: 'Hospitality', is_pro: false }, error: null });
  });

  it('updates the real card as the employer edits the location, title, and pay', async () => {
    const user = userEvent.setup();
    render(<PostJobPage />);
    const location = await screen.findByLabelText(/^location/i);
    expect((location as HTMLInputElement).value).toBe('English Harbour');
    await user.clear(location);
    await user.type(location, 'Codrington, Barbuda');
    await user.type(screen.getByLabelText(/^job title/i), 'Boat captain');
    await user.click(screen.getByRole('radio', { name: 'Hourly' }));
    await user.type(screen.getByLabelText(/minimum rate/i), '25');
    expect(screen.getByRole('heading', { name: 'Boat captain' })).toBeTruthy();
    expect(screen.getByText('Codrington, Barbuda', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('From EC$25')).toBeTruthy();
    expect(screen.getByText('/hr')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /view boat captain/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /share on whatsapp/i })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /show salary/i }));
    expect(screen.queryByText('From EC$25')).toBeNull();
    expect(screen.getByText('Salary discussed after application')).toBeTruthy();
  });

  it.each([false, true])('preserves the age and featured status of an edited listing (featured: %s)', async (featured) => {
    api.editId = 'job-1';
    api.listing.mockResolvedValue({ data: {
      id: 'job-1', title: 'Boat captain', location: 'Codrington, Barbuda',
      salary_min: 25, salary_type: 'hourly', created_at: '2020-01-01T00:00:00Z', is_featured: featured,
    }, error: null });
    render(<PostJobPage />);
    await screen.findByRole('heading', { name: 'Boat captain' });
    expect(screen.queryByText('New', { exact: true })).toBeNull();
    expect(Boolean(screen.queryByText('Featured', { exact: true }))).toBe(featured);
    expect((screen.getByRole('radio', { name: 'Hourly' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('/hr')).toBeTruthy();
  });
});

describe('post-job submission', () => {
  beforeEach(() => {
    api.load.mockResolvedValue({ data: { id: 'company-1', company_name: 'Island Studio', location: 'English Harbour', industry: 'Tourism & Hospitality', is_pro: false }, error: null });
  });

  async function fillJob() {
    const user = userEvent.setup();
    render(<PostJobPage />);
    await user.type(await screen.findByLabelText(/^job title/i), 'Boat captain');
    await user.type(screen.getByLabelText(/^job description/i), 'Lead harbour tours.');
    await user.click(screen.getByRole('radio', { name: 'Hourly' }));
    await user.type(screen.getByLabelText(/minimum rate/i), '25');
    return user;
  }

  it('lets an employer with existing listings submit another job without upgrading', async () => {
    api.count.mockResolvedValue({ count: 2, error: null });
    const user = await fillJob();
    expect(screen.queryByRole('link', { name: /upgrade/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /submit job listing/i }));
    await screen.findByRole('heading', { name: /job submitted successfully/i });
    expect(api.payload).toHaveBeenCalledTimes(1);
    expect(api.count).toHaveBeenCalledTimes(1);
  });

  it('offers a retry if the load-time listing count is unavailable', async () => {
    api.count.mockResolvedValueOnce({ count: null, error: { message: 'offline' } });
    const user = userEvent.setup();
    render(<PostJobPage />);
    await user.click(await screen.findByRole('button', { name: /try again/i }));
    expect(await screen.findByLabelText(/^job title/i)).toBeTruthy();
  });

  it('loads existing employers and listing edits', async () => {
    api.load.mockResolvedValue({ data: { id: 'company-1', company_name: 'Island Studio', is_pro: true }, error: null });
    api.count.mockResolvedValue({ count: 2, error: null });
    const first = render(<PostJobPage />);
    expect(await screen.findByLabelText(/^job title/i)).toBeTruthy();
    expect(api.count).toHaveBeenCalledTimes(1);
    first.unmount();
    api.count.mockClear();
    api.load.mockResolvedValue({ data: { id: 'company-1', company_name: 'Island Studio', is_pro: false }, error: null });
    api.editId = 'job-1';
    api.listing.mockResolvedValue({ data: { title: 'Existing job', created_at: '2020-01-01T00:00:00Z' }, error: null });
    render(<PostJobPage />);
    expect((await screen.findByLabelText(/^job title/i) as HTMLInputElement).value).toBe('Existing job');
    expect(api.count).not.toHaveBeenCalled();
  });

  it('focuses the first invalid post field and associates its error', async () => {
    const user = userEvent.setup();
    render(<PostJobPage />);
    const title = await screen.findByLabelText(/^job title/i);
    await user.click(screen.getByRole('button', { name: /submit job listing/i }));
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(title.getAttribute('aria-describedby')!)?.textContent).toBe('Job title is required');
    expect(api.payload).not.toHaveBeenCalled();
  });

  it('saves hourly pay with company defaults, accepts a short description, and explains review', async () => {
    const user = await fillJob();
    expect(screen.getByRole('list', { name: /employer setup progress/i }).querySelector('[aria-current="step"]')?.textContent).toContain('First job');
    expect(screen.getByLabelText(/^job description/i).getAttribute('maxlength')).toBe('6000');
    expect(screen.getByText('19 / 6000')).toBeTruthy();
    expect(screen.getByText(/a short description gets fewer/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /submit job listing/i }));
    await screen.findByRole('heading', { name: /job submitted successfully/i });
    expect(api.payload).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Boat captain', description: 'Lead harbour tours.', category: 'Tourism & Hospitality',
      location: 'English Harbour', salary_min: 25, salary_type: 'hourly', status: 'pending_approval',
    }));
    expect(screen.getByText('Usually reviewed within one business day. You will get an email when it goes live.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /go to my listings/i }));
    expect(api.push).toHaveBeenCalledWith('/my-listings');
  });
});

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
