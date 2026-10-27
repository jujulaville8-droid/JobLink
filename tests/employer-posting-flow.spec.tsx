import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostJobPage from '@/app/(dashboard)/post-job/page';
import { EMPTY_POSTING, templateDescription } from '@/lib/job-posting';
const api = vi.hoisted(() => ({ replace: vi.fn(), listing: null as unknown, saved: [] as Record<string, unknown>[], failSave: false, setup: false, failLoad: false, query: '' }));
vi.mock('next/navigation', () => { const router = { replace: api.replace }; return { useRouter: () => router, useSearchParams: () => new URLSearchParams(api.query) }; });
beforeEach(() => {
  api.listing = null; api.saved = []; api.failSave = false; api.setup = false; api.failLoad = false; api.query = ''; api.replace.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.includes('screening-preview')) return Response.json({ criteria: [{ id: 'one', label: 'Customer service experience' }] });
    if (url.includes('description')) return Response.json({ description: templateDescription(body), source: 'template' });
    if (body) { api.saved.push(body); return api.failSave ? Response.json({ error: 'Save unavailable' }, { status: 500 }) : Response.json({ listing: { id: body.id, status: 'pending_approval' } }); }
    if (api.failLoad) return Response.json({}, { status: 500 });
    return Response.json({ setup: api.setup, company: { industry: 'Tourism & Hospitality', location: 'English Harbour' }, listing: api.listing });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function basics() {
  const user = userEvent.setup(); render(<PostJobPage />);
  await user.type(await screen.findByLabelText('Job title *'), 'Boat captain');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return user;
}
async function review() {
  const user = await basics();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByLabelText('Job description *');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return user;
}
it('validates the current step and focuses the missing required title', async () => {
  const user = userEvent.setup(); render(<PostJobPage />);
  const title = await screen.findByLabelText('Job title *');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(document.activeElement).toBe(title));
  expect(title.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('alert').textContent).toContain('Job title is required');
  expect(api.saved).toHaveLength(0);
});
it('navigates back, preserves pay and toggles benefits', async () => {
  const user = await basics();
  await user.click(screen.getByRole('radio', { name: 'Hourly' }));
  await user.type(screen.getByLabelText('Minimum pay (XCD, optional)'), '25');
  await user.click(screen.getByRole('button', { name: /Meals on duty/ }));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect((screen.getByLabelText('Job title *') as HTMLInputElement).value).toBe('Boat captain');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect((screen.getByLabelText('Minimum pay (XCD, optional)') as HTMLInputElement).value).toBe('25');
  expect(screen.getByRole('button', { name: /Meals on duty/ }).getAttribute('aria-pressed')).toBe('true');
});
it('prepares an editable fallback when AI fails and never replaces edits on return', async () => {
  const user = await basics();
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  const description = await screen.findByLabelText('Job description *');
  expect((description as HTMLTextAreaElement).value).toContain('Boat captain');
  await user.clear(description); await user.type(description, 'Lead harbour tours.');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect((screen.getByLabelText('Job description *') as HTMLTextAreaElement).value).toBe('Lead harbour tours.');
});
it('autosaves incomplete progress server side and restores the step and description', async () => {
  const user = userEvent.setup(); const view = render(<PostJobPage />);
  await user.type(await screen.findByLabelText('Job title *'), 'Chef');
  await waitFor(() => expect(api.saved.some(v => v.action === 'draft')).toBe(true));
  const saved = api.saved.at(-1)!;
  view.unmount();
  api.listing = { id: saved.id, status: 'draft', draft_data: { form: { ...(saved.form as object), description: 'My own draft' }, step: 2 } };
  render(<PostJobPage />);
  expect((await screen.findByLabelText('Job description *') as HTMLTextAreaElement).value).toBe('My own draft');
  expect(screen.getByText(/Draft restored/)).toBeTruthy();
  expect(screen.getByText('Step 3 of 5')).toBeTruthy();
});
it('shows save failure and offers retry without losing entered content', async () => {
  api.failSave = true;
  const user = await basics();
  await user.click(await screen.findByRole('button', { name: 'Retry draft save' }));
  api.failSave = false;
  await user.click(await screen.findByRole('button', { name: 'Retry draft save' }));
  await screen.findByText('Draft saved');
});
it('reviews all sections, invites optional additions and jumps to each edit step', async () => {
  const user = await review();
  expect(screen.getByText('Add optional pay information')).toBeTruthy();
  expect(screen.getByText('Add optional benefits')).toBeTruthy();
  for (const [name, heading] of [['Basics', 'Basics'], ['Pay and benefits', 'Pay and benefits'], ['Describe the job', 'Describe the job'], ['Hiring details', 'Hiring details']]) {
    await user.click(screen.getByRole('button', { name: `Edit ${name}` }));
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
    while (!screen.queryByRole('button', { name: 'Submit Job Listing' })) await user.click(screen.getByRole('button', { name: 'Continue' }));
  }
});
it('submits with optional fields empty and shows the real pending state without fabricated counters', async () => {
  const user = await review();
  await user.click(screen.getByRole('button', { name: 'Submit Job Listing' }));
  await screen.findByRole('heading', { name: 'Job submitted successfully' });
  expect(api.saved.filter(v => v.action === 'submit')).toHaveLength(1);
  expect(screen.getByText(/Your job is in review/)).toBeTruthy();
  expect(screen.getByText('Your job performance will appear here.')).toBeTruthy();
});
it('requires category and description but accepts a short description', async () => {
  const user = await basics();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  const description = await screen.findByLabelText('Job description *');
  await user.clear(description);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('alert').textContent).toContain('Description is required');
  await user.type(description, 'Tours.');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.selectOptions(screen.getByLabelText('Category *'), '');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('alert').textContent).toContain('Please select a category');
});
it('loads active edits without autosaving and uses the edit action', async () => {
  api.query = 'edit=job'; api.listing = { ...EMPTY_POSTING, title: 'Chef', description: 'Prepare meals.', category: 'Tourism & Hospitality', location: 'St Johns', id: 'job', status: 'active', salary_min: 0 };
  const user = userEvent.setup(); render(<PostJobPage />);
  await screen.findByLabelText('Job title *');
  for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(api.saved).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByRole('heading', { name: 'Listing updated' });
  expect(api.saved[0].action).toBe('edit');
});
it('routes a missing company to setup', async () => {
  api.setup = true; render(<PostJobPage />);
  await waitFor(() => expect(api.replace).toHaveBeenCalledWith('/company-profile'));
});
it('offers retry on load failure rather than an empty form', async () => {
  api.failLoad = true; const user = userEvent.setup(); render(<PostJobPage />);
  const retry = await screen.findByRole('button', { name: 'Try again' });
  api.failLoad = false; await user.click(retry);
  expect(await screen.findByLabelText('Job title *')).toBeTruthy();
});
