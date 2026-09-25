import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import HomePage from '@/components/home/HomePage';
import EmployerAccountGate from '@/components/EmployerAccountGate';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('makes both Members entry points accessible links without nested anchors', () => {
  const { container } = render(<HomePage jobs={[]} stats={{ jobs: 5, employers: 5, members: 279, applications: 0 }} />);
  const links = container.querySelectorAll('.home-trust a[href="/members"]');
  expect(links.length).toBe(2);
  expect(links[0].textContent).toContain('Members');
  expect(links[1].textContent).toContain('Members across Antigua');
  expect(container.querySelector('.home-trust a a')).toBeNull();
});

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email_confirmed_at?: string }, row: null as null | { role: string; email_verified: boolean; is_banned: boolean } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: auth.user } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: auth.row }) }) }) }),
}) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

it.each([
  [null, null, '/signup?role=employer&returnTo=%2Fmembers'],
  [{ id: 'e', email_confirmed_at: 'today' }, { role: 'employer', email_verified: true, is_banned: false }, '/browse-candidates'],
  [{ id: 'e' }, { role: 'employer', email_verified: false, is_banned: false }, '/verify-email?returnTo=%2Fmembers'],
  [{ id: 'e', email_confirmed_at: 'today' }, { role: 'employer', email_verified: true, is_banned: true }, '/?suspended=1'],
] as const)('routes Members according to server account state (%j)', async (user, row, destination) => {
  auth.user = user;
  auth.row = row;
  const { default: MembersPage } = await import('@/app/members/page');
  await expect(MembersPage()).rejects.toThrow(`redirect:${destination}`);
});

it('does not let a seeker browse candidates or silently change their account', async () => {
  auth.user = { id: 's', email_confirmed_at: 'today' };
  auth.row = { role: 'seeker', email_verified: true, is_banned: false };
  const { default: MembersPage } = await import('@/app/members/page');
  const { getByRole } = render(await MembersPage());
  expect(getByRole('heading', { name: 'Browse candidates with an employer account' })).toBeTruthy();
  expect(getByRole('button', { name: 'Sign out and create an employer account' })).toBeTruthy();
});

it('recovers a missing account record through verification sync', async () => {
  auth.user = { id: 'missing', email_confirmed_at: 'today' };
  auth.row = null;
  const { default: MembersPage } = await import('@/app/members/page');
  await expect(MembersPage()).rejects.toThrow('redirect:/verify-email?returnTo=%2Fmembers');
});

it('enables employer access only after an explicit click and returns to the guarded gateway', async () => {
  window.history.replaceState({}, '', '/members?setup=1');
  const fetcher = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetcher);
  const { getByRole } = render(<EmployerAccountGate allowSetup />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(getByRole('button', { name: 'Set up employer access' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/switch-role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"role":"employer"}' }));
  await waitFor(() => expect(window.location.pathname).toBe('/members'));
  await waitFor(() => expect(window.location.search).toBe(''));
});

it('keeps the account gate visible when employer setup fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  const { getByRole, findByRole } = render(<EmployerAccountGate allowSetup />);
  fireEvent.click(getByRole('button', { name: 'Set up employer access' }));
  expect((await findByRole('alert')).textContent).toContain('Could not set up employer access');
});
