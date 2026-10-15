import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const fixture = vi.hoisted(() => ({ closesAfter: null as string | null }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), notFound: () => { throw new Error('Not found'); } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ error: null, data: {
    id: 'deadline-job', company_id: 'deadline-company', title: 'Front Desk Agent', description: 'Greet guests.\nSend your CV to hr@hotel.example to apply.',
    status: 'active', posted_by_admin: false, expires_at: null, created_at: '2026-10-01', closes_after: fixture.closesAfter,
    job_type: 'full_time', location: 'St. John\'s, Antigua', salary_visible: false, category: 'Tourism & Hospitality',
    company: { id: 'deadline-company', company_name: 'Hotel', logo_url: null, description: null, industry: 'Hospitality', location: 'Antigua', website: null, is_verified: false },
  } }) }) }) }),
}) }));

import JobDetailPage, { generateMetadata } from '@/app/jobs/[id]/page';

const NOW = new Date('2026-10-15T16:00:00Z'); // Oct 15 in Antigua
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); fixture.closesAfter = null; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function renderPage() {
  const { container } = render(await JobDetailPage({ params: Promise.resolve({ id: 'deadline-job' }) }));
  const posting = [...container.querySelectorAll('script[type="application/ld+json"]')]
    .map(node => JSON.parse(node.textContent ?? '{}'))
    .find(data => data['@type'] === 'JobPosting');
  return { text: container.textContent ?? '', posting };
}

it('shows Apply by and date-only validThrough while the deadline is upcoming or today', async () => {
  for (const date of ['2026-10-20', '2026-10-15']) {
    fixture.closesAfter = date;
    const { text, posting } = await renderPage();
    expect(text).toContain(`Apply by ${date === '2026-10-20' ? 'October 20, 2026' : 'October 15, 2026'}`);
    expect(text).not.toContain('no longer available');
    expect(posting?.validThrough).toBe(date);
    expect((await generateMetadata({ params: Promise.resolve({ id: 'deadline-job' }) })).robots).toBeUndefined();
    cleanup();
  }
});

it('closes the listing after the deadline: notice, no Apply by, no JobPosting, noindex', async () => {
  fixture.closesAfter = '2026-10-14';
  const { text, posting } = await renderPage();
  expect(text).toContain('This job is no longer available');
  expect(text).toContain('Applications for this vacancy closed on October 14, 2026.');
  expect(text).not.toContain('Apply by');
  expect(posting).toBeUndefined();
  expect(text).toContain('Greet guests.');
  expect(text).not.toContain('hr@hotel.example');
  const metadata = await generateMetadata({ params: Promise.resolve({ id: 'deadline-job' }) });
  expect(String(metadata.description)).not.toContain('hr@hotel.example');
  expect((await generateMetadata({ params: Promise.resolve({ id: 'deadline-job' }) })).robots).toEqual({ index: false, follow: true });
});

it('shows no deadline and no validThrough when none is set', async () => {
  const { text, posting } = await renderPage();
  expect(text).not.toContain('Apply by');
  expect(posting).toBeDefined();
  expect(Object.hasOwn(posting, 'validThrough')).toBe(false);
});
