import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ShortlistBoard from '@/components/shortlist/ShortlistBoard';
import MobileReview from '@/components/shortlist/MobileReview';
import VerdictChip from '@/components/shortlist/VerdictChip';
import { buildShortlist, toClientEntry, type OverrideAction, type ShortlistApplication, type VerdictInfo } from '@/lib/shortlist/ranking';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const job = { title: 'Bartender', description: 'Bartender for cocktails, cash handling and customer service.', category: 'Hospitality' };

function app(id: string, first: string, last: string, day: number, skills: string[], cv: string[] = []): ShortlistApplication {
  return {
    id,
    applied_at: `2026-11-${day}T15:00:00Z`,
    status: 'applied',
    cover_letter_text: id === 'a1' ? 'I love making cocktails.' : null,
    seeker: { id: `p-${id}`, first_name: first, last_name: last, skills, cv_skills: cv, bio: `${first} bio`, cv_url: 'cv.pdf', experience_years: 7 },
  };
}

function fixture(extra = 0) {
  const applications = [
    app('a1', 'Amara', 'Joseph', 17, ['Bartending', 'Cocktails', 'Gardening'], ['Cash handling']),
    app('a2', 'Kellan', 'Baptiste', 16, ['Bartending']),
    app('a3', 'Dario', 'Hunte', 15, ['Customer service']),
    app('a4', 'Shanice', 'Lovell', 14, []),
    app('a5', 'Nia', 'Francis', 13, []),
    app('a6', 'Passed', 'Person', 12, []),
    ...Array.from({ length: extra }, (_, i) => app(`x${i}`, `Extra${i}`, 'Cand', 10, [])),
  ];
  const verdicts = new Map<string, VerdictInfo>([
    ['a1', { verdict: 'good_fit', verdict_text: 'This person is a good fit because they have busy bar experience.' }],
    ['a2', { verdict: 'good_fit', verdict_text: 'This person is a good fit because they mix drinks.' }],
    ['a3', { verdict: 'not_enough_information', verdict_text: 'Not enough information to judge bar skills.' }],
    ['a4', { verdict: 'not_a_fit', verdict_text: 'This person is not a fit because bartending is missing.' }],
    ['a6', { verdict: 'good_fit', verdict_text: 'Passed line.' }],
  ]);
  const overrides = new Map<string, Set<OverrideAction>>([
    ['a6', new Set<OverrideAction>(['remove'])],
    ['a2', new Set<OverrideAction>(['pin'])],
  ]);
  const result = buildShortlist({ job, applications, verdicts, overrides });
  return { ...result, client: result.entries.map(toClientEntry), clientPassed: result.passed.map(toClientEntry) };
}

it('renders ranked rows with verdict lines and chips, and never renders the internal score', () => {
  const { entries, client, clientPassed } = fixture();
  const { container } = render(<ShortlistBoard entries={client} passed={clientPassed} />);
  const text = container.textContent ?? '';
  expect(text).toContain('Amara Joseph');
  expect(text).toContain('This person is a good fit because they have busy bar experience.');
  expect(screen.getAllByText('Good fit').length).toBeGreaterThan(0);
  expect(screen.getByText('Not enough information')).toBeTruthy();
  expect(screen.getByText('Not a fit')).toBeTruthy();
  expect(screen.getByText('Not screened')).toBeTruthy();
  expect(screen.getByText('Saved')).toBeTruthy();
  expect(text).toContain('Passed (1)');
  for (const entry of entries) {
    expect(entry.score).toBeGreaterThanOrEqual(0);
    if (entry.score > 0) expect(text).not.toContain(String(entry.score));
  }
  expect(text).not.toMatch(/%|\bpoints?\b|\bscore\b/i);
  expect(JSON.stringify(client)).not.toContain('"score"');
});

it('shows the top 5 and expands to all candidates', () => {
  const { client, clientPassed } = fixture(3);
  render(<ShortlistBoard entries={client} passed={clientPassed} />);
  expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: `Show all ${client.length} candidates` }));
  expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(client.length);
  fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
  expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(5);
});

it('opens the candidate panel with matched skills, resume links and actions, without leaving the page', async () => {
  const { entries, client, clientPassed } = fixture();
  render(<ShortlistBoard entries={client} passed={clientPassed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Amara Joseph' }));
  const panel = screen.getByRole('dialog', { name: 'Candidate profile' });
  const p = within(panel);
  expect(p.getByText('Skills matched to this job')).toBeTruthy();
  expect(p.getByText('Bartending')).toBeTruthy();
  expect(p.getByText('Cocktails')).toBeTruthy();
  expect(p.getByText('Cash handling')).toBeTruthy();
  expect(p.getByText('Parsed from resume')).toBeTruthy();
  expect(p.getByText('Gardening')).toBeTruthy();
  expect(p.getByText('This person is a good fit because they have busy bar experience.')).toBeTruthy();
  expect(p.getByText('I love making cocktails.')).toBeTruthy();
  expect(p.getByRole('link', { name: /View/ }).getAttribute('href')).toBe('/api/cv-download?profileId=p-a1');
  expect(p.getByRole('link', { name: /Download/ }).hasAttribute('download')).toBe(true);
  expect(p.getByRole('button', { name: 'Message candidate' })).toBeTruthy();
  expect(panel.textContent).not.toContain(String(entries[0].score));

  fireEvent.click(p.getByRole('button', { name: 'Interview' }));
  await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/applications/a1/status', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'interview' }) }));
  expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/shortlist/overrides', expect.objectContaining({ method: 'POST', body: JSON.stringify({ applicationId: 'a1', action: 'interview' }) }));

  fireEvent.click(p.getByRole('button', { name: 'Save for later' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(fetchMock).toHaveBeenLastCalledWith('/api/shortlist/overrides', expect.objectContaining({ method: 'POST', body: JSON.stringify({ applicationId: 'a1', action: 'pin' }) }));

  fireEvent.click(p.getByRole('button', { name: 'Pass' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(fetchMock).toHaveBeenLastCalledWith('/api/shortlist/overrides', expect.objectContaining({ method: 'POST', body: JSON.stringify({ applicationId: 'a1', action: 'remove' }) }));
});

it('unpins a saved candidate and restores a passed one with DELETE', async () => {
  const { client, clientPassed } = fixture();
  render(<ShortlistBoard entries={client} passed={clientPassed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Passed (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenLastCalledWith('/api/shortlist/overrides', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ applicationId: 'a6', action: 'remove' }) }));

  fireEvent.click(screen.getByRole('button', { name: 'Open Kellan Baptiste' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy());
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Saved' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(fetchMock).toHaveBeenLastCalledWith('/api/shortlist/overrides', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ applicationId: 'a2', action: 'pin' }) }));
});

it('mobile review shows one card at a time with progress, banner, navigation and actions', async () => {
  const { entries, client } = fixture();
  const { container } = render(
    <MobileReview
      jobId="job-1"
      jobs={[{ id: 'job-1', title: 'Bartender' }, { id: 'job-2', title: 'Line Cook' }]}
      entries={client}
      progress={{ reviewed: 2, total: 6, interviewReady: 1 }}
    />,
  );
  expect(screen.getByText('2 strong fits waiting')).toBeTruthy();
  expect(screen.getByText('Reviewed 2 of 6')).toBeTruthy();
  expect(screen.getByText('Amara Joseph')).toBeTruthy();
  expect(screen.getByText('Matched skills')).toBeTruthy();
  expect(screen.queryByText('Kellan Baptiste')).toBeNull();
  for (const entry of entries) if (entry.score > 0) expect(container.textContent).not.toContain(String(entry.score));

  fireEvent.click(screen.getByRole('button', { name: 'Next candidate' }));
  expect(screen.getByText('Kellan Baptiste')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Previous candidate' }));
  expect(screen.getByText('Amara Joseph')).toBeTruthy();

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'job-2' } });
  expect(router.push).toHaveBeenCalledWith('/my-listings/job-2/shortlist');

  fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/shortlist/overrides', expect.objectContaining({ method: 'POST', body: JSON.stringify({ applicationId: 'a1', action: 'remove' }) })));
  expect(screen.getByRole('button', { name: 'Interview' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save for later' })).toBeTruthy();
});

it('VerdictChip uses the spec labels', () => {
  render(<><VerdictChip verdict="good_fit" /><VerdictChip verdict="not_enough_information" /><VerdictChip verdict="not_a_fit" /><VerdictChip verdict={null} /></>);
  for (const label of ['Good fit', 'Not enough information', 'Not a fit', 'Not screened']) expect(screen.getByText(label)).toBeTruthy();
});
