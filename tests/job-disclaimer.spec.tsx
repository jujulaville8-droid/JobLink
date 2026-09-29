import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import JobDetailPage from '@/app/jobs/[id]/page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), notFound: () => { throw new Error('Not found'); } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ error: null, data: {
    id: 'test-job', title: 'Gym Attendant', description: 'Help members at the gym.',
    status: 'active', posted_by_admin: true, expires_at: null, created_at: '2026-09-29',
    job_type: 'full_time', location: 'Vista, Antigua', salary_visible: false,
    company: { id: 'test-company', company_name: 'MOfit Gym and Fitness Centre', logo_url: null, description: null, industry: 'Fitness', location: 'Antigua', website: null, is_verified: false },
  } }) }) }) }),
}) }));
afterEach(cleanup);

it('shows an on-behalf job and application controls without the disclaimer banner', async () => {
  const { container } = render(await JobDetailPage({ params: Promise.resolve({ id: 'test-job' }) }));
  expect(screen.getByRole('heading', { name: 'Gym Attendant' })).toBeTruthy();
  expect(screen.getByText('Help members at the gym.')).toBeTruthy();
  expect(container.textContent).toContain('MOfit Gym and Fitness Centre');
  expect(container.textContent).not.toContain('This listing was posted by');
  expect(container.textContent).not.toContain('It has not been submitted directly by the employer');
  expect(screen.getAllByRole('link', { name: /sign in to apply/i }).length).toBeGreaterThan(0);
});
