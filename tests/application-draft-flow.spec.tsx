import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import ApplyPage from '@/app/jobs/[id]/apply/page';
import { readApplicationDraft, saveApplicationDraft } from '@/lib/application-drafts';

const fixture = vi.hoisted(() => ({
  userId: '11111111-1111-4111-8111-111111111111',
  jobId: '33333333-3333-4333-8333-333333333333',
  existing: false,
  incomplete: false,
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: fixture.jobId }) }));
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => ({ user: { id: fixture.userId } }) }));
// Happy DOM cannot finish/cancel native animations reliably. Browser QA uses the real motion components.
vi.mock('motion/react', () => {
  const element = (tag: 'div' | 'button') => function MotionElement({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) {
    for (const name of ['variants', 'initial', 'animate', 'transition', 'exit', 'whileHover', 'whileTap']) delete props[name];
    return createElement(tag, props, children);
  };
  return { motion: { div: element('div'), button: element('button') } };
});
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: fixture.userId } } }) },
  from(table: string) {
    const result = () => ({ data: table === 'job_listings'
      ? { id: fixture.jobId, title: 'Synthetic role', location: 'Antigua', job_type: 'full_time', status: 'active', company: { company_name: 'Synthetic company' } }
      : table === 'users' ? { role: 'seeker' }
      : table === 'seeker_profiles' ? { id: '22222222-2222-4222-8222-222222222222', first_name: 'Test', last_name: 'Seeker', phone: fixture.incomplete ? '' : '+12685550100', cv_url: 'private-fixture.pdf' }
      : table === 'applications' && fixture.existing ? { id: 'existing-application' } : null,
      error: null });
    const query = { select: () => query, eq: () => query, single: async () => result(), maybeSingle: async () => result() };
    return query;
  },
}) }));

beforeEach(() => {
  fixture.userId = '11111111-1111-4111-8111-111111111111';
  fixture.jobId = '33333333-3333-4333-8333-333333333333';
  fixture.existing = false;
  fixture.incomplete = false;
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

async function ready() {
  await screen.findByRole('textbox', { name: 'Cover letter' });
}

it('keeps unsaved text and saved draft on failure, then clears it only after successful submission', async () => {
  const send = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Try later' }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 201 }));
  vi.stubGlobal('fetch', send);
  render(<ApplyPage />);
  await ready();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My unfinished cover letter' } });
  expect(localStorage.length).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Save draft on this device' }));
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
  await screen.findByText('Submission Failed');
  expect(readApplicationDraft(fixture.userId, fixture.jobId)?.coverLetter).toBe('My unfinished cover letter');
  fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('My unfinished cover letter');
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
  await screen.findByText('Application Submitted!');
  expect(readApplicationDraft(fixture.userId, fixture.jobId)).toBeNull();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.every(([url]) => url === '/api/jobs/apply')).toBe(true);
  expect(JSON.parse(send.mock.calls[1][1].body)).toEqual({ job_id: fixture.jobId, cover_letter_text: 'My unfinished cover letter' });
});

it('preserves a saved draft across leaving and returning, without restoring or submitting automatically', async () => {
  const send = vi.fn();
  vi.stubGlobal('fetch', send);
  saveApplicationDraft(fixture.userId, fixture.jobId, 'Resume this cover letter');
  const first = render(<ApplyPage />);
  await ready();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  first.unmount();
  render(<ApplyPage />);
  await ready();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Resume draft' }));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Resume this cover letter');
  expect(send).not.toHaveBeenCalled();
});

it.each(['user', 'job'] as const)('clears in-memory text when the %s changes', async boundary => {
  const view = render(<ApplyPage />);
  await ready();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Previous form private text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft on this device' }));
  if (boundary === 'user') fixture.userId = '55555555-5555-4555-8555-555555555555';
  else fixture.jobId = '66666666-6666-4666-8666-666666666666';
  view.rerender(<ApplyPage />);
  await ready();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  expect(screen.queryByRole('button', { name: 'Resume draft' })).toBeNull();
});

it('removes a draft after duplicate detection without attempting a notification or another submission', async () => {
  saveApplicationDraft(fixture.userId, fixture.jobId, 'Stale saved draft');
  fixture.existing = true;
  const send = vi.fn();
  vi.stubGlobal('fetch', send);
  render(<ApplyPage />);
  await screen.findByText('Already Applied');
  expect(readApplicationDraft(fixture.userId, fixture.jobId)).toBeNull();
  expect(send).not.toHaveBeenCalled();
});

it('removes the saved draft on an API duplicate response', async () => {
  saveApplicationDraft(fixture.userId, fixture.jobId, 'Saved draft');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 409 })));
  render(<ApplyPage />);
  await ready();
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
  await screen.findByText('Already Applied');
  expect(readApplicationDraft(fixture.userId, fixture.jobId)).toBeNull();
});

it('retains the original application destination when profile completion is required', async () => {
  fixture.incomplete = true;
  const send = vi.fn();
  vi.stubGlobal('fetch', send);
  render(<ApplyPage />);
  const link = await screen.findByRole('link', { name: 'Complete Profile' });
  const target = new URL(link.getAttribute('href')!, 'https://joblink.invalid');
  expect(target.pathname).toBe('/profile');
  expect(target.searchParams.get('returnTo')).toBe(`/jobs/${fixture.jobId}/apply`);
  await waitFor(() => expect(send).not.toHaveBeenCalled());
});
