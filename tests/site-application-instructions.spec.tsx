import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JobDetailPage, { generateMetadata } from '@/app/jobs/[id]/page';
import ApplyButton from '@/components/ApplyButton';
import { publicJobDescription } from '@/lib/public-job-description';
import { publicVacancyDescription } from '@/lib/public-vacancy-description';
import { jobMetaDescription } from '@/lib/seo/job-description';
import { EMPLOYER_APPROVED_COMPANIES, EMPLOYER_APPROVED_JOBS } from '@/lib/seo/employerApproved';
import observedJobs from './fixtures/approved-job-listings.json';

const woodstock = observedJobs[1];
const previousInstructions = 'How to apply: all enquiries must be by email. Send your CV/resume and any other pertinent information to office@woodstockboats.com. We will get back to all applicants.';
const instructions = 'How to apply: use the Apply button on this page to submit your application and CV/resume through JobLinks. Include any other pertinent information in the cover letter field. We will get back to all applicants.';
const expected = publicJobDescription(woodstock.description.replace(previousInstructions, instructions));

function makeJob() {
  return {
    ...woodstock, company: { ...woodstock.company, user_id: 'synthetic-owner',
      contact_email: 'private-delivery@example.test', logo_url: null,
      description: 'Existing company description.', industry: null, is_verified: false },
  };
}
const db = vi.hoisted(() => ({ job: null as ReturnType<typeof makeJob> | null }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: db.job }) }) }) }),
}) }));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T15:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

async function representations() {
  const page = document.createElement('div');
  page.innerHTML = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: db.job!.id }) }));
  const schemas = [...page.querySelectorAll('script[type="application/ld+json"]')].map(el => JSON.parse(el.textContent!));
  const schema = schemas.find(item => item['@type'] === 'JobPosting');
  const body = document.createElement('div');
  body.innerHTML = schema.description;
  for (const br of body.querySelectorAll('br')) br.replaceWith('\n');
  const schemaDescription = [...body.querySelectorAll('p')].map(p => p.textContent).join('\n\n');
  const metadata = await generateMetadata({ params: Promise.resolve({ id: db.job!.id }) });
  return { page, schema, schemaDescription, metadata };
}

describe('Woodstock exact-record editorial application instructions', () => {
  it('changes only the application paragraph, preserving stored facts and private contact', () => {
    const job = Object.freeze(makeJob());
    const before = structuredClone(job);
    expect(job.description.split(previousInstructions)).toHaveLength(2);
    expect(publicVacancyDescription(job)).toBe(expected);
    expect(expected).toContain(instructions);
    expect(expected).toContain('Learn more: woodstockboatbuilders.com');
    expect(expected).not.toMatch(/office@|all enquiries must be by email|29 October/);
    expect(job).toEqual(before);
    expect(job.description).toContain('Apply before: 29 October 2026');
    expect(EMPLOYER_APPROVED_JOBS[job.id].validThrough).toBe('2026-10-29');
  });

  it.each([
    { id: 'another-vacancy' }, { id: undefined }, { id: 'toString' },
    { company_id: 'another-company' }, { company_id: undefined },
    { title: 'New title' },
  ])('does not rewrite another source identity: %j', change => {
    const job = { ...woodstock, ...change };
    expect(publicVacancyDescription(job)).toBe(publicJobDescription(job.description));
  });

  it.each([
    `${woodstock.description}\nEmployer update.`, `${woodstock.description}\n`,
    woodstock.description.replace('29 October', '30 October'),
    woodstock.description.replace('office@woodstockboats.com', 'new@example.test'),
    'Employer-authored text: email careers@example.test to apply.', '', null,
  ])('preserves later employer text and application directions: %s', description => {
    const job = { ...woodstock, description };
    expect(publicVacancyDescription(job)).toBe(publicJobDescription(description));
  });

  it('keeps visible, schema and metadata descriptions aligned without changing approval or Apply routing', async () => {
    db.job = makeJob();
    const before = structuredClone(db.job);
    const approvals = structuredClone({ companies: EMPLOYER_APPROVED_COMPANIES, jobs: EMPLOYER_APPROVED_JOBS });
    const { page, schema, schemaDescription, metadata } = await representations();
    expect(page.querySelector('.whitespace-pre-wrap')?.textContent).toBe(expected);
    expect(schemaDescription).toBe(expected);
    expect(schema.validThrough).toBe('2026-10-29');
    expect(schema.directApply).toBe(false); // Copy does not broaden the schema claim.
    const meta = jobMetaDescription({ ...woodstock, description: expected, companyName: woodstock.company.company_name });
    expect(metadata.description).toBe(meta);
    expect(metadata.openGraph?.description).toBe(meta);
    expect(metadata.twitter?.description).toBe(meta);
    const apply = [...page.querySelectorAll('a')].filter(a => a.textContent === 'Sign In to Apply');
    expect(apply).toHaveLength(2);
    expect(apply.every(a => a.getAttribute('href') === `/login?returnTo=/jobs/${woodstock.id}/apply`)).toBe(true);
    expect(page.textContent).not.toContain('private-delivery@example.test');
    expect({ companies: EMPLOYER_APPROVED_COMPANIES, jobs: EMPLOYER_APPROVED_JOBS }).toEqual(approvals);
    expect(db.job).toEqual(before);
  });

  it('honors subsequent employer edits in every public representation', async () => {
    db.job = makeJob();
    db.job.company.user_id = 'new-owner';
    db.job.description = 'Updated employer instructions: email new@example.test. Learn more: employer.example.';
    const { page, schemaDescription, metadata } = await representations();
    expect(page.querySelector('.whitespace-pre-wrap')?.textContent).toBe(db.job.description);
    expect(schemaDescription).toBe(db.job.description);
    expect(metadata.description).toContain(db.job.description);
  });
});

const correctedJobIds = [
  '232f9e93-d28c-4e8b-bdb5-3c85093e61d6', '318d3b16-6aff-453c-b0d3-fc5f2d779783',
  '0d1245af-a425-4a7f-b670-15dc8c275993', 'd4fdb396-a0b0-427d-aae0-ed756274375e',
  'ade78a5c-e0f6-4f5f-8008-117d7a4b96ee', woodstock.id,
];
describe.each(correctedJobIds)('Apply destination for %s', jobId => {
  it.each(['apply', 'login', 'profile-incomplete'] as const)('keeps the correct job through %s', state => {
    const page = document.createElement('div');
    page.innerHTML = renderToStaticMarkup(<ApplyButton jobId={jobId} state={state} />);
    const destination = new URL(page.querySelector('a')!.getAttribute('href')!, 'https://joblinkantigua.com');
    if (state === 'apply') expect(destination.pathname).toBe(`/jobs/${jobId}/apply`);
    else {
      expect(destination.pathname).toBe(state === 'login' ? '/login' : '/profile');
      expect(destination.searchParams.get('returnTo')).toBe(`/jobs/${jobId}/apply`);
    }
  });
  it.each(['closed', 'applied', 'not-seeker'] as const)('preserves the %s guard', state => {
    expect(renderToStaticMarkup(<ApplyButton jobId={jobId} state={state} />)).not.toContain('href=');
  });
});

it('preserves unrelated and ambiguous imported instructions, contact facts and source footer', () => {
  for (const description of [
    'How to apply\nEmail topbunantigua@gmail.com to apply.',
    'Contact (as posted): applications@agservices.ag\nOriginally posted: 2026-09-24\nSource: Youth On The Move (YOM) (Facebook)\n\n—\nThis listing was imported by JobLink from a public job post so Antiguan job seekers can find it in one place. It was not posted by the business directly.',
    'Contact (as posted): Imcdonald@epicureanantigua.com',
    'We are seeking reliable, outgoing individuals to conduct face-to-face market research surveys in public locations.',
    'For accessibility questions, email support@example.test. Work schedule: 29 October 2026.',
  ]) expect(publicVacancyDescription({ id: 'unrelated-job', title: 'Unrelated job', description })).toBe(description);
});
