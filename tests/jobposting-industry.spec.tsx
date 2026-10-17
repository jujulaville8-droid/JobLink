import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const fixture = vi.hoisted(() => ({ industry: 'Non-Profit & NGO' as string | null, location: 'Bethesda, Antigua' as string | null }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), notFound: () => { throw new Error('Not found'); } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ error: null, data: {
    id: 'industry-job', title: 'Animal Care Assistant', description: 'Care for the donkeys.',
    status: 'active', posted_by_admin: false, expires_at: null, created_at: '2026-10-01',
    job_type: 'full_time', location: fixture.location, salary_visible: false, category: 'Tourism & Hospitality',
    company: { id: 'industry-company', company_name: 'Sanctuary', logo_url: null, description: null, industry: fixture.industry, location: 'Antigua', website: null, is_verified: false },
  } }) }) }) }),
}) }));

import JobDetailPage from '@/app/jobs/[id]/page';

beforeEach(() => { fixture.industry = 'Non-Profit & NGO'; fixture.location = 'Bethesda, Antigua'; });
afterEach(cleanup);

async function renderPage() {
  const { container } = render(await JobDetailPage({ params: Promise.resolve({ id: 'industry-job' }) }));
  const script = [...container.querySelectorAll('script[type="application/ld+json"]')]
    .map(node => JSON.parse(node.textContent ?? '{}'))
    .find(data => data['@type'] === 'JobPosting');
  return { container, posting: script };
}

it('uses the visible company industry, not the job category, in JobPosting markup', async () => {
  const { container, posting } = await renderPage();
  expect(posting).toBeDefined();
  expect(container.textContent).toContain('Non-Profit & NGO');
  expect(posting.industry).toBe('Non-Profit & NGO');
  expect(JSON.stringify(posting)).not.toContain('Tourism & Hospitality');
});

it.each([null, '', '   '])('omits industry when the page shows none (%j)', async industry => {
  fixture.industry = industry;
  const { posting } = await renderPage();
  expect(posting).toBeDefined();
  expect(Object.hasOwn(posting, 'industry')).toBe(false);
});

it.each([null, '', '   '])('displays an honest missing location and never substitutes company HQ in JobPosting (%j)', async location => {
  fixture.location = location;
  const { container, posting } = await renderPage();
  expect(container.textContent).toContain('Location not provided');
  expect(posting.jobLocation.address.addressLocality).toBeUndefined();
  const bar = container.querySelector('[data-mobile-apply]')!;
  expect(bar.closest('.animate-fade-up')).toBeNull();
});
