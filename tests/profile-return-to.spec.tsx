import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProfilePage from '@/app/(dashboard)/profile/page';

const api = vi.hoisted(() => ({
  params: '',
  user: { id: 'seeker-id', email: 'seeker@example.com' },
  profile: null as Record<string, unknown> | null,
  builtResume: false,
  save: vi.fn(),
  setAvatarUrl: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(api.params) }));
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: api.user, isLoading: false, setAvatarUrl: api.setAvatarUrl }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: table === 'cv_profiles' ? api.builtResume ? { id: 'cv-id', completion_percentage: 70 } : null : api.profile,
      error: null,
    }) }) }) }),
  }),
}));

const origin = window.location.origin;
const applicationPath = '/jobs/123e4567-e89b-42d3-a456-426614174000/apply';

function openProfile(returnTo?: string) {
  api.params = returnTo === undefined ? '' : new URLSearchParams({ returnTo }).toString();
  window.history.replaceState({}, '', `${origin}/profile${api.params ? `?${api.params}` : ''}`);
  return render(<ProfilePage />);
}

async function editProfile() {
  await screen.findByRole('heading', { name: 'About' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
}

beforeEach(() => {
  api.profile = {
    id: 'profile-id', first_name: 'Jane', last_name: 'Doe', phone: '555-0100',
    cv_url: 'seeker-id/cv.pdf', skills: [], experience_years: null,
  };
  api.builtResume = false;
  api.save.mockImplementation(async () => Response.json({ success: true, profile_id: 'profile-id' }));
  vi.stubGlobal('fetch', api.save);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('profile completion returns to the original application', () => {
  it('returns after creating a profile with a previously built resume', async () => {
    api.profile = null;
    api.builtResume = true;
    openProfile(applicationPath);
    await screen.findByRole('heading', { name: 'Create Profile' });
    fireEvent.change(screen.getByPlaceholderText('John'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Doe'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('+1 (268) 555-0123'), { target: { value: '555-0100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and return to application' }));
    await waitFor(() => expect(window.location.pathname).toBe(applicationPath), { timeout: 1800 });
    expect(JSON.parse(api.save.mock.calls[0][1].body).profile_id).toBeNull();
  });
  it('returns only after the required edit is successfully saved, without submitting an application', async () => {
    api.profile!.first_name = '';
    openProfile(applicationPath);
    await editProfile();
    fireEvent.change(screen.getByPlaceholderText('John'), { target: { value: 'Jane' } });
    expect(window.location.pathname).toBe('/profile');
    fireEvent.click(screen.getByRole('button', { name: 'Save and return to application' }));
    await waitFor(() => expect(window.location.pathname).toBe(applicationPath), { timeout: 1800 });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(api.save.mock.calls[0][1].body).first_name).toBe('Jane');
  });

  it('accepts an existing built resume without requiring an uploaded CV', async () => {
    api.profile!.cv_url = '';
    api.builtResume = true;
    openProfile(applicationPath);
    await editProfile();
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(screen.getByText(/Your built resume meets the resume requirement/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save and return to application' }));
    await waitFor(() => expect(window.location.pathname).toBe(applicationPath), { timeout: 1800 });
  });

  it('keeps an incomplete saved profile editable and explains what is still needed', async () => {
    api.profile!.phone = '';
    openProfile(applicationPath);
    await editProfile();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Profile saved. Still needed to apply: Phone number.')).toBeTruthy();
    await waitFor(() => expect(api.setAvatarUrl).toHaveBeenCalled(), { timeout: 1800 });
    expect(screen.getByRole('heading', { name: 'Edit Profile' })).toBeTruthy();
    expect(window.location.pathname).toBe('/profile');
  });

  it('keeps edits in place when the save fails and does not redirect', async () => {
    api.save.mockResolvedValue(Response.json({ error: 'Please try again.' }, { status: 503 }));
    openProfile(applicationPath);
    await editProfile();
    fireEvent.change(screen.getByPlaceholderText('John'), { target: { value: 'Janet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and return to application' }));
    expect(await screen.findByText('Please try again.')).toBeTruthy();
    expect((screen.getByPlaceholderText('John') as HTMLInputElement).value).toBe('Janet');
    expect(window.location.pathname).toBe('/profile');
    expect(api.setAvatarUrl).not.toHaveBeenCalled();
  });

  it.each([undefined, '//evil.example', '/members'])('preserves ordinary editing for returnTo %j', async (returnTo) => {
    openProfile(returnTo);
    await editProfile();
    expect(screen.queryByText('Continue your application')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'About' }, { timeout: 1800 });
    expect(window.location.pathname).toBe('/profile');
  });

  it('offers an explicit return link and carries application context to the resume builder', async () => {
    openProfile(applicationPath);
    expect((await screen.findByRole('link', { name: 'Return to application' })).getAttribute('href')).toBe(applicationPath);
    expect(screen.getByRole('link', { name: /Build your resume/ }).getAttribute('href')).toBe(`/profile/cv?returnTo=${encodeURIComponent(applicationPath)}`);
    expect(api.save).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/profile');
  });

  it('saves profile edits before opening the alternative resume builder', async () => {
    api.profile!.cv_url = '';
    openProfile(applicationPath);
    await editProfile();
    fireEvent.change(screen.getByPlaceholderText('John'), { target: { value: 'Janet' } });
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile and build a resume instead' }));
    await waitFor(() => expect(window.location.pathname).toBe('/profile/cv'), { timeout: 1800 });
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(applicationPath);
    expect(JSON.parse(api.save.mock.calls[0][1].body).first_name).toBe('Janet');
  });
});
