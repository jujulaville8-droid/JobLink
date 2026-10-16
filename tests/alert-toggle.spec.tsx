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
it('keeps all anonymous search context through signup using the supported returnTo parameter', () => {
  render(<AlertToggle loggedIn={false} emphasis query="chef" location="English Harbour" category="Food & Beverage" jobType={['full_time', 'part_time']} />);
  const signup = new URL(screen.getByRole('link').getAttribute('href')!, 'https://joblinkantigua.com');
  expect(signup.searchParams.has('next')).toBe(false);
  const target = new URL(signup.searchParams.get('returnTo')!, signup);
  expect(target.searchParams.get('location')).toBe('English Harbour');
  expect(target.searchParams.get('q')).toBe('chef');
  expect(target.searchParams.getAll('job_type')).toEqual(['full_time', 'part_time']);
  expect(screen.getByText(/Location and company-name matching are not supported/)).toBeTruthy();
});
it('never submits a location-only or multiple-job-type alert as if those criteria were supported', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const { rerender } = render(<AlertToggle loggedIn emphasis location="English Harbour" />);
  expect(screen.getByRole('link').getAttribute('href')).toBe('/alerts');
  expect(screen.queryByRole('button')).toBeNull();
  rerender(<AlertToggle loggedIn query="chef" jobType={['full_time', 'part_time']} />);
  expect(screen.getByRole('link').getAttribute('href')).toBe('/alerts');
  expect(screen.queryByRole('button')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it('saves only supported criteria and explains that location is not part of the alert', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ alert: { id: 'test' } })); vi.stubGlobal('fetch', fetch);
  render(<AlertToggle loggedIn query="chef" location="English Harbour" category="Food & Beverage" jobType="full_time" />);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByRole('status');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ keywords: ['chef'], industry: 'Food & Beverage', job_type: 'full_time' });
  expect(screen.getByText(/Location and company-name matching are not supported/)).toBeTruthy();
});
