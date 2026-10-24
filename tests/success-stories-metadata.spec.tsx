import { expect, it, vi } from 'vitest';
vi.mock('@/lib/testimonials', () => ({ approvedTestimonials: async () => [] }));
import { metadata } from '@/app/success-stories/page';

it('self-canonicalizes success stories so it is not read as a duplicate of the homepage', () => {
  expect(metadata.alternates?.canonical).toBe('https://joblinkantigua.com/success-stories');
  expect(metadata.title).toBe('Local hiring stories | JobLink Antigua');
  expect(metadata.description).toBe('Employer experiences hiring through JobLink in Antigua and Barbuda.');
});
