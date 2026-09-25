import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern';
import config from '../next.config';
import HomePage from '@/components/home/HomePage';
import type { Job } from '@/components/JobCard';

const logo = 'https://hfcfuvbyqxkvnenfykex.supabase.co/storage/v1/object/public/company-logos/imported/example.jpg';
const job: Job = { id: 'job', title: 'Receptionist', company_name: 'Test Company', company_logo: logo, location: 'Antigua', job_type: 'Full Time', salary_min: null, salary_max: null, salary_visible: false, created_at: '2026-09-25', is_featured: false, is_pro_company: false };
afterEach(cleanup);

it('allows public company logos through the image optimizer without allowing arbitrary hosts or buckets', () => {
  const patterns = config.images?.remotePatterns || [];
  expect(hasRemoteMatch([], patterns, new URL(logo))).toBe(true);
  expect(hasRemoteMatch([], patterns, new URL(logo.replace('company-logos', 'private-documents')))).toBe(false);
  expect(hasRemoteMatch([], patterns, new URL(logo.replace('https:', 'http:')))).toBe(false);
  expect(hasRemoteMatch([], patterns, new URL('https://untrusted.example/logo.jpg'))).toBe(false);
});

it('replaces failed logos with company initials and tries a new logo when the URL changes', () => {
  const { container, rerender } = render(<HomePage jobs={[job]} />);
  const monogram = () => container.querySelector('.home-job-monogram')!;
  fireEvent.error(monogram().querySelector('img')!);
  expect(monogram().querySelector('img')).toBeNull();
  expect(monogram().textContent).toBe('TC');
  rerender(<HomePage jobs={[{ ...job, company_logo: logo.replace('example.jpg', 'replacement.jpg') }]} />);
  expect(monogram().querySelector('img')).not.toBeNull();
});

it('shows initials immediately when a company has no logo', () => {
  const { container } = render(<HomePage jobs={[{ ...job, company_logo: null }]} />);
  expect(container.querySelector('.home-job-monogram')?.textContent).toBe('TC');
  expect(container.querySelector('.home-job-monogram img')).toBeNull();
});
