import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import HomeHeader from '@/components/home/HomeHeader';
import HomeEmployers from '@/components/home/HomeEmployers';

const auth = vi.hoisted(() => ({ isAuthenticated: false, userRole: null as string | null }));
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => auth }));
afterEach(cleanup);

it.each([
  [false, null, '/signup?role=employer', 'Create employer account'],
  [true, 'employer', '/post-job', 'Post a job'],
  [true, 'seeker', '/dashboard', 'Dashboard'],
  [true, null, '/dashboard', 'Dashboard'],
] as const)('keeps homepage entry correct for authenticated=%s role=%s', (signedIn, role, href, label) => {
  auth.isAuthenticated = signedIn;
  auth.userRole = role;
  const { container } = render(<><HomeHeader /><HomeEmployers stats={{ jobs: 0, employers: 0, members: 0, applications: 0 }} /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  const mobile = screen.getByRole('navigation', { name: 'Mobile navigation' });
  expect(within(mobile).getAllByRole('link', { name: label }).every(link => link.getAttribute('href') === href)).toBe(true);
  const primary = container.querySelector('.home-header-actions .home-button');
  expect(primary?.getAttribute('href')).toBe(href);
  expect(primary?.textContent).toBe(label);
  const section = container.querySelector('#employers')!;
  const links = Array.from(section.querySelectorAll('a'));
  expect(links.filter(link => link.textContent?.includes(label)).every(link => link.getAttribute('href') === href)).toBe(true);
  expect(screen.getByRole('link', { name: 'Get hiring help' }).getAttribute('href')).toBe('/employers/hiring-help');
});
