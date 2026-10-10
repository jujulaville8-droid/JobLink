import { beforeEach, expect, it, vi } from 'vitest';
import { jobMetaDescription } from '@/lib/seo/job-description';

const db = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  select: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from: () => ({ select: db.select.mockImplementation(() => ({
    eq: () => ({ single: async () => ({ data: db.job }) }),
  })) }),
}) }));
import { generateMetadata } from '@/app/jobs/[id]/page';

beforeEach(() => {
  db.select.mockClear();
  db.job = {
    title: 'Carpenter / Boatbuilder', description: 'Repair wooden boats.\n\nExperience with marine joinery required.',
    location: 'English Harbour, Antigua', status: 'active', expires_at: null,
    company: { company_name: 'Woodstock BoatBuilders', logo_url: null },
  };
});

it('uses the public vacancy summary and actual location across search and share metadata', async () => {
  const metadata = await generateMetadata({ params: Promise.resolve({ id: 'test-job' }) });
  const expected = 'Apply for Carpenter / Boatbuilder at Woodstock BoatBuilders in English Harbour, Antigua. Repair wooden boats. Experience with marine joinery required.';
  expect(metadata.description).toBe(expected);
  expect(metadata.openGraph?.description).toBe(expected);
  expect(metadata.twitter?.description).toBe(expected);
  expect(metadata.description).not.toContain('#1');
  expect(db.select).toHaveBeenCalledWith('title, description, location, status, company:companies(company_name, logo_url)');
  expect(metadata.title).toEqual({ absolute: 'Carpenter / Boatbuilder at Woodstock BoatBuilders | JobLinks' });
  expect(metadata.alternates?.canonical).toBe('https://joblinkantigua.com/jobs/test-job');
});

it('keeps descriptions vacancy-specific for roles at the same employer', () => {
  const context = { title: 'Assistant', companyName: 'Local Employer', location: 'Antigua' };
  expect(jobMetaDescription({ ...context, description: 'Support guests at reception.' }))
    .not.toBe(jobMetaDescription({ ...context, description: 'Prepare food in the kitchen.' }));
});

it('omits application cutoffs consistently from search and social snippets, preserving the raw record', async () => {
  db.job!.description = 'Application deadline: October 30, 2026. Repair wooden boats. Apply by email to office@example.com.';
  const before = structuredClone(db.job);
  const metadata = await generateMetadata({ params: Promise.resolve({ id: 'test-job' }) });
  const expected = 'Apply for Carpenter / Boatbuilder at Woodstock BoatBuilders in English Harbour, Antigua. Repair wooden boats. Apply by email to office@example.com.';
  expect(metadata.description).toBe(expected);
  expect(metadata.openGraph?.description).toBe(expected);
  expect(metadata.twitter?.description).toBe(expected);
  expect(db.job).toEqual(before);
});

it('uses honest fallbacks when optional public fields are empty', () => {
  expect(jobMetaDescription({ title: 'Cook', companyName: '  ', location: '\n', description: ' ' }))
    .toBe('Apply for Cook at a company in Antigua and Barbuda. View the vacancy and apply on JobLinks.');
});

it('normalizes whitespace without inventing requirements or altering public punctuation', () => {
  expect(jobMetaDescription({ title: ' Cook ', companyName: 'A & B', location: "St. John’s", description: 'Use <tools> & equipment.\n  Saturday only.' }))
    .toBe('Apply for Cook at A & B in St. John’s. Use <tools> & equipment. Saturday only.');
});

it('bounds long excerpts at a word boundary and preserves the complete title', () => {
  const title = 'Cashier / Stock Clerk / Sales Associate / Butcher / Baker / Deli Staff / Cleaner / Management';
  const description = 'Assist customers and maintain stock. '.repeat(20);
  const result = jobMetaDescription({ title, description });
  expect(result).toContain(title);
  expect(result).toMatch(/maintain…$/);
  expect(result.length).toBeLessThan(title.length + 260);
});

it('does not split surrogate pairs in unbroken long text', () => {
  const result = jobMetaDescription({ title: 'Assistant', description: '🌴'.repeat(200) });
  expect(result.endsWith('🌴…')).toBe(true);
  expect(Array.from(result.split('. ')[1])).toHaveLength(181);
});

it.each([null, { status: 'closed' }])('does not expose a summary for unavailable jobs: %j', async job => {
  db.job = job;
  expect(await generateMetadata({ params: Promise.resolve({ id: 'missing' }) }))
    .toEqual({ title: { absolute: 'Job Not Found | JobLinks' } });
});
