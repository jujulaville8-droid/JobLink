import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AlertToggle from '@/components/AlertToggle';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('shows server errors and resets saved state when search criteria change', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ error: 'Complete your seeker profile.' }, { status: 403 })).mockResolvedValueOnce(Response.json({ alert: { id: '1' } })));
  const { rerender } = render(<AlertToggle loggedIn query="chef" />);
  fireEvent.click(screen.getByRole('button'));
  expect((await screen.findByRole('alert')).textContent).toContain('Complete your seeker profile');
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('Alert saved');
  rerender(<AlertToggle loggedIn query="cook" />);
  expect(screen.getByRole('button').textContent).toContain('Notify me');
});
it('links to alert setup rather than submitting empty search criteria', () => {
  render(<AlertToggle loggedIn emphasis jobType={[]} />);
  expect(screen.getByRole('link').getAttribute('href')).toBe('/alerts');
});
