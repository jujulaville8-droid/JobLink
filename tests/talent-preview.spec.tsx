import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import TalentPreview from '@/components/home/TalentPreview';

const auth = vi.hoisted(() => ({ isAuthenticated: false, userRole: null as string | null }));
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => auth }));
beforeEach(() => { auth.isAuthenticated = false; auth.userRole = null; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('renders an honest, usable signup path in the initial server HTML', () => {
  const html = renderToString(<TalentPreview />);
  expect(html).toContain('Create employer account');
  expect(html).toContain('/signup?role=employer&amp;returnTo=%2Fmembers');
  expect(html).toContain('Create an employer account to browse candidates');
  expect(html).not.toContain('No real profiles shown');
  expect(html).not.toMatch(/live profiles|online now|available now|\bmoving\b|<button/i);
});

it('never fetches or embeds candidate records, even with all visual effects removed', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const { container } = render(<TalentPreview />);
  expect(fetcher).not.toHaveBeenCalled();
  const illustration = container.querySelector('#talent-preview-illustration')!;
  expect(illustration.getAttribute('aria-hidden')).toBe('true');
  expect(illustration.querySelector('img, a, button, input, [tabindex]')).toBeNull();
  expect(container.innerHTML).not.toMatch(/avatar_url|cv_url|user_id|first_name|last_name/);
  expect(container.querySelector('[src], a[href^="http"]')).toBeNull();
  expect(screen.getByRole('link', { name: 'Create employer account' }).getAttribute('href'))
    .toBe('/signup?role=employer&returnTo=%2Fmembers');
  expect(screen.getByRole('link', { name: 'Sign in to view candidates' }).getAttribute('href'))
    .toBe('/login?returnTo=%2Fmembers');
});

it.each([
  ['employer', 'View candidates'],
  ['seeker', 'Employer access'],
  ['admin', 'Employer access'],
  [null, 'Employer access'],
])('routes signed-in %s accounts through the server gate', (role, label) => {
  auth.isAuthenticated = true;
  auth.userRole = role;
  render(<TalentPreview />);
  expect(screen.getByRole('link', { name: label! }).getAttribute('href')).toBe('/members');
  expect(screen.queryByRole('link', { name: 'Create employer account' })).toBeNull();
});

it('supports persistent pause and resume with accessible names matching the action', () => {
  render(<TalentPreview />);
  const control = screen.getByRole('button', { name: 'Pause profile preview animation' });
  expect(control.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(control);
  expect(control.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Resume profile preview animation' })).toBe(control);
  expect(control.textContent).toContain('Resume');
  fireEvent.click(control);
  expect(control.getAttribute('aria-pressed')).toBe('false');
});
