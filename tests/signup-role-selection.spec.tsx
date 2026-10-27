import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SignupPage from '@/app/(auth)/signup/page';
import AuthLayout from '@/app/(auth)/layout';

const state = vi.hoisted(() => ({ params: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(state.params) }));
vi.mock('@/components/AuthRedirect', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
beforeEach(() => { state.params = ''; });
afterEach(cleanup);

it('renders both unselected roles and disables continue until a role is chosen', () => {
  const { container } = render(<AuthLayout><SignupPage /></AuthLayout>);
  expect(screen.getByRole('heading', { name: 'Join JobLink' })).toBeTruthy();
  const seeker = screen.getByRole('radio', { name: /I'm looking for a job/ });
  const employer = screen.getByRole('radio', { name: /I'm hiring/ });
  expect(seeker.getAttribute('aria-checked')).toBe('false');
  expect(employer.getAttribute('aria-checked')).toBe('false');
  expect((screen.getByRole('button', { name: 'Select an option to continue' }) as HTMLButtonElement).disabled).toBe(true);
  expect(container.querySelector('[data-signup-step="role-selection"]')).not.toBeNull();

  fireEvent.keyDown(employer, { key: ' ' });
  expect(employer.getAttribute('aria-checked')).toBe('true');
  const continueButton = screen.getByRole('button', { name: 'Continue as Employer' });
  expect((continueButton as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(continueButton);
  expect(screen.getByRole('heading', { name: 'Create your employer account' })).toBeTruthy();
  expect(container.querySelector('[data-signup-step="role-selection"]')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Back to role selection' }));
  expect(container.querySelector('[data-signup-step="role-selection"]')).not.toBeNull();
  expect(screen.getByRole('radio', { name: /I'm hiring/ }).getAttribute('aria-checked')).toBe('true');
});

it.each(['seeker', 'employer'])('keeps preselected %s signup on the narrow form step', role => {
  state.params = `role=${role}`;
  const { container } = render(<AuthLayout><SignupPage /></AuthLayout>);
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.getByLabelText(/email address/i)).toBeTruthy();
  expect(container.querySelector('[data-signup-step="role-selection"]')).toBeNull();
});
