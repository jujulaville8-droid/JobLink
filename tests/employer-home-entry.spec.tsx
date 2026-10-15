import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import HomeHeader from '@/components/home/HomeHeader';
import HomeEmployers from '@/components/home/HomeEmployers';

const auth = vi.hoisted(() => ({ isAuthenticated: false, userRole: null as string | null }));
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => auth }));
afterEach(cleanup);

it.each([
  [false, null, '/signup?role=employer', 'Create employer account', 2],
  [true, 'employer', '/post-job', 'Post a job', 2],
  [true, 'seeker', '/dashboard', 'Dashboard', 1],
  [true, 'admin', '/dashboard', 'Dashboard', 1],
  [true, null, '/dashboard', 'Dashboard', 1],
] as const)('keeps homepage entry correct for authenticated=%s role=%s', (signedIn, role, href, label, actionCount) => {
  auth.isAuthenticated = signedIn;
  auth.userRole = role;
  const { container } = render(<><HomeHeader /><HomeEmployers stats={{ jobs: 0, employers: 0, members: 0, applications: 0 }} /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  const desktop = container.querySelector<HTMLElement>('.home-header-actions')!;
  const mobile = screen.getByRole('navigation', { name: 'Mobile navigation' });
  for (const region of [desktop, mobile]) {
    expect(within(region).getByRole('link', { name: label }).getAttribute('href')).toBe(href);
    expect(within(region).getByRole('link', { name: signedIn ? 'Dashboard' : 'Sign in' }).getAttribute('href')).toBe(signedIn ? '/dashboard' : '/login');
    expect(within(region).queryAllByRole('link', { name: 'Dashboard' })).toHaveLength(signedIn ? 1 : 0);
  }
  expect(within(desktop).getAllByRole('link')).toHaveLength(actionCount);
  expect(within(mobile).getAllByRole('link')).toHaveLength(actionCount + 3);
  const primary = container.querySelector('.home-header-actions .home-button');
  expect(primary?.getAttribute('href')).toBe(href);
  expect(primary?.textContent).toBe(label);
  const section = container.querySelector('#employers')!;
  const links = Array.from(section.querySelectorAll('a'));
  expect(links.filter(link => link.textContent?.includes(label)).every(link => link.getAttribute('href') === href)).toBe(true);
  expect(screen.getByRole('link', { name: 'Get hiring help' }).getAttribute('href')).toBe('/employers/hiring-help');
});

it('updates both header regions as the role resolves, changes, and signs out', () => {
  auth.isAuthenticated = true;
  auth.userRole = null;
  const { container, rerender } = render(<HomeHeader />);
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

  for (const [signedIn, role, labels] of [
    [true, null, ['Dashboard']],
    [true, 'employer', ['Dashboard', 'Post a job']],
    [true, 'seeker', ['Dashboard']],
    [false, null, ['Sign in', 'Create employer account']],
  ] as const) {
    auth.isAuthenticated = signedIn;
    auth.userRole = role;
    rerender(<HomeHeader />);
    const desktop = container.querySelector<HTMLElement>('.home-header-actions')!;
    const mobile = screen.getByRole('navigation', { name: 'Mobile navigation' });
    for (const region of [desktop, mobile]) {
      for (const label of labels) {
        expect(within(region).getByRole('link', { name: label })).toBeTruthy();
      }
    }
    expect(within(desktop).getAllByRole('link')).toHaveLength(labels.length);
    expect(within(mobile).getAllByRole('link')).toHaveLength(labels.length + 3);
  }
});
