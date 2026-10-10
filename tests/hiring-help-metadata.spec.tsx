import { expect, it, vi } from 'vitest';
vi.mock('@/components/EmployerEnquiryForm', () => ({ default: () => null }));
vi.mock('@/lib/testimonials', () => ({ approvedTestimonials: async () => [] }));
import { metadata } from '@/app/employers/hiring-help/page';

it('uses an absolute hiring-help title so the root template cannot append JobLinks twice', () => {
  expect(metadata.title).toEqual({ absolute: 'Send us your vacancy | Hiring help in Antigua | JobLinks' });
  expect(metadata.alternates?.canonical).toBe('https://joblinkantigua.com/employers/hiring-help');
  expect(metadata.description).toContain('Send JobLinks your vacancy');
});
