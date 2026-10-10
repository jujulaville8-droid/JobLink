import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JobDetailPage, { generateMetadata } from '@/app/jobs/[id]/page';
import observedJobs from './fixtures/approved-job-listings.json';
import {
  EMPLOYER_APPROVED_COMPANIES,
  EMPLOYER_APPROVED_JOBS,
  getEmployerApproval,
} from '@/lib/seo/employerApproved';

// Public anonymous-read snapshot from September 30, 2026. Approval provenance
// is the separate owner attestation in employerApproved.ts, not this fixture.
const candidates = observedJobs.map((job) => ({
  id: job.id,
  companyId: job.company_id,
  companyName: job.company.company_name,
  title: job.title,
  job,
}));
const originalApprovals = { ...EMPLOYER_APPROVED_JOBS };
const originalCompanyApprovals = { ...EMPLOYER_APPROVED_COMPANIES };

function makeJob(candidate = candidates[0]) {
  return {
    ...candidate.job,
    expires_at: null as string | null,
    company: {
      ...candidate.job.company,
      user_id: 'synthetic-placeholder-owner',
      logo_url: null,
      description: null,
      industry: null,
      is_verified: false,
    },
  };
}

const db = vi.hoisted(() => ({ job: null as ReturnType<typeof makeJob> | null, error: null as Error | null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('Not found'); } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: db.job, error: db.error }) }) }) }),
}) }));

async function pageHtml() {
  return renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: db.job?.id ?? 'missing-job' }) }));
}

async function schemas() {
  const html = await pageHtml();
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T20:10:00Z'));
  db.job = makeJob();
  db.error = null;
});
afterEach(() => {
  Object.assign(EMPLOYER_APPROVED_JOBS, originalApprovals);
  Object.assign(EMPLOYER_APPROVED_COMPANIES, originalCompanyApprovals);
  vi.useRealTimers();
});

describe.each(candidates)('$companyName owner-attested approval', (candidate) => {
  it('removes JobPosting when both vacancy and company approval are revoked', async () => {
    db.job = makeJob(candidate);
    delete EMPLOYER_APPROVED_JOBS[candidate.id];
    delete EMPLOYER_APPROVED_COMPANIES[candidate.companyId];
    expect(getEmployerApproval(candidate.companyId, candidate.id)).toBeNull();
    expect((await schemas()).map((schema) => schema['@type'])).toEqual(['BreadcrumbList']);
    expect(await pageHtml()).toContain('Sign In to Apply');
  });

  it('emits accurate JobPosting in server HTML for the owner-attested vacancy', async () => {
    db.job = makeJob(candidate);
    const data = await schemas();
    expect(data.map((schema) => schema['@type'])).toEqual(['JobPosting', 'BreadcrumbList']);
    expect(data[0]).toMatchObject({
      identifier: { value: candidate.id },
      title: candidate.title,
      datePosted: db.job.created_at,
      hiringOrganization: { name: candidate.companyName },
      employmentType: 'FULL_TIME',
      jobLocation: { address: {
        addressCountry: 'AG',
        addressLocality: candidate.job.company.location.replace(', Antigua', ''),
      } },
    });
    const description = document.createElement('div');
    description.innerHTML = data[0].description;
    const expectedDescription = candidate.job.description.replace('Apply before: 29 October 2026', '');
    expect(description.textContent!.replace(/\s/g, '')).toBe(expectedDescription.replace(/\s/g, ''));
    expect(data[0].description).toContain('<p>');
    expect(data[0]).not.toHaveProperty('baseSalary');
    expect(data[0].validThrough).toBe(EMPLOYER_APPROVED_JOBS[candidate.id].validThrough);
    expect(EMPLOYER_APPROVED_JOBS[candidate.id]).toMatchObject({
      attestedOn: '2026-09-30',
      evidenceReference: 'owner-attestation:2026-09-30:Sentinel_cace3b51c42c81919512b87c905bc49a',
    });
    expect(data[0].datePosted).not.toBe(EMPLOYER_APPROVED_JOBS[candidate.id].attestedOn);
  });

  it('authorizes another or future vacancy under the explicit company-wide approval', async () => {
    db.job = { ...makeJob(candidate), id: 'synthetic-other-vacancy' };
    expect(getEmployerApproval(candidate.companyId)).toMatchObject({
      companyName: candidate.companyName,
      approvedOn: '2026-09-30',
    });
    expect((await schemas()).map((schema) => schema['@type'])).toEqual(['JobPosting', 'BreadcrumbList']);
    expect((await schemas())[0]).not.toHaveProperty('validThrough');
  });

  it('falls back to company-wide approval when vacancy-specific permission is removed', async () => {
    db.job = makeJob(candidate);
    delete EMPLOYER_APPROVED_JOBS[candidate.id];
    expect(getEmployerApproval(candidate.companyId, candidate.id)).toBe(EMPLOYER_APPROVED_COMPANIES[candidate.companyId]);
    expect((await schemas())[0]['@type']).toBe('JobPosting');
  });

  it('keeps vacancy-only permission scoped if company-wide approval is revoked, including after an owner change', async () => {
    db.job = makeJob(candidate);
    delete EMPLOYER_APPROVED_COMPANIES[candidate.companyId];
    expect((await schemas())[0]['@type']).toBe('JobPosting');
    db.job.id = 'synthetic-other-vacancy';
    db.job.company.user_id = 'synthetic-claiming-employer';
    expect(getEmployerApproval(candidate.companyId, db.job.id)).toBeNull();
    expect((await schemas()).map((schema) => schema['@type'])).toEqual(['BreadcrumbList']);
  });

  it('does not authorize the same job id after reassignment to another company', async () => {
    db.job = makeJob(candidate);
    db.job.company_id = 'synthetic-other-company';
    db.job.company.id = db.job.company_id;
    expect((await schemas()).map((schema) => schema['@type'])).toEqual(['BreadcrumbList']);
  });

  it('retains vacancy and company permission after the company owner changes', async () => {
    db.job = makeJob(candidate);
    db.job.company.user_id = 'synthetic-claiming-employer';
    expect((await schemas())[0]['@type']).toBe('JobPosting');
    db.job.id = 'synthetic-other-existing-vacancy';
    expect((await schemas())[0]['@type']).toBe('JobPosting');
  });
});

it('keeps legitimate self-posted jobs eligible without an approval entry', async () => {
  db.job!.id = 'synthetic-self-posted-job';
  db.job!.company_id = 'synthetic-self-posting-company';
  db.job!.company.id = db.job!.company_id;
  db.job!.posted_by_admin = false;
  expect((await schemas())[0]['@type']).toBe('JobPosting');
});

it('blocks unapproved imports even when the admin flag is false', async () => {
  delete EMPLOYER_APPROVED_JOBS[db.job!.id];
  delete EMPLOYER_APPROVED_COMPANIES[db.job!.company_id];
  db.job!.posted_by_admin = false;
  db.job!.description += '\nImported by JobLink from a public job post';
  expect((await schemas()).map((schema) => schema['@type'])).toEqual(['BreadcrumbList']);
  Object.assign(EMPLOYER_APPROVED_JOBS, originalApprovals);
  Object.assign(EMPLOYER_APPROVED_COMPANIES, originalCompanyApprovals);
  expect((await schemas())[0]['@type']).toBe('JobPosting');
});

it('keeps Top Bun company-wide approval and its visible/schema part-time correction', async () => {
  db.job!.id = 'e03a2b8c-f69b-42bb-bc43-13a5d0917291';
  db.job!.company_id = '362300b7-c0c5-4c2e-a9f6-6fe79f187e71';
  db.job!.company.id = db.job!.company_id;
  db.job!.company.company_name = 'Top Bun Antigua';
  db.job!.title = 'Cook (Part time, Saturday only)';
  expect((await schemas())[0].employmentType).toBe('PART_TIME');
  expect(await pageHtml()).toContain('Part Time');
  db.job!.id = 'synthetic-another-top-bun-vacancy';
  expect((await schemas())[0].employmentType).toBe('FULL_TIME');
});

it.each(['closed', 'pending_approval', 'expired'])('returns notFound for a %s job despite approval', async (status) => {
  db.job!.status = status;
  await expect(pageHtml()).rejects.toThrow('Not found');
});

it.each(['2026-09-30T20:09:59Z', '2026-09-30T20:10:00Z'])('keeps the page and Apply when stored deadline %s is reached, but omits JobPosting', async (expiresAt) => {
  db.job!.expires_at = expiresAt;
  const before = structuredClone(db.job);
  const html = await pageHtml();
  expect(html).toContain('Sign In to Apply');
  expect(html).not.toContain('Expires');
  expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  const metadata = await generateMetadata({ params: Promise.resolve({ id: db.job!.id }) });
  expect(metadata.title).not.toEqual({ absolute: 'Job Not Found | JobLinks' });
  expect(db.job).toEqual(before);
});

it('retains an actual stored future deadline without inventing one', async () => {
  db.job = makeJob(candidates[1]);
  db.job.expires_at = '2026-10-20T12:00:00Z';
  const before = structuredClone(db.job);
  expect((await schemas())[0].validThrough).toBe('2026-10-20T12:00:00.000Z');
  expect(await pageHtml()).not.toContain('Expires');
  expect(db.job).toEqual(before);
});

it('does not emit JobPosting without a hiring organization name', async () => {
  db.job!.company.company_name = '';
  expect((await schemas()).map((schema) => schema['@type'])).toEqual(['BreadcrumbList']);
});

it.each(['Application deadline: October 30, 2026.', '', ' \n '])('keeps the page and Apply but omits JobPosting when the public description is empty: %j', async description => {
  db.job!.description = description;
  const before = structuredClone(db.job);
  const html = await pageHtml();
  expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  expect(html).toContain(db.job!.title);
  expect(html).toContain('Sign In to Apply');
  expect(html).not.toContain('Application deadline');
  expect(db.job).toEqual(before);
});

it('returns notFound for a missing listing', async () => {
  db.job = null;
  await expect(pageHtml()).rejects.toThrow('Not found');
});

it.each([null, undefined, '', 'constructor', '__proto__', 'toString'])('rejects missing or inherited company key %s', (companyId) => {
  expect(getEmployerApproval(companyId, candidates[0].id)).toBeNull();
});

it.each([null, undefined, '', 'constructor', '__proto__', 'toString'])('does not mistake missing or inherited vacancy key %s for vacancy permission', (jobId) => {
  expect(getEmployerApproval(candidates[0].companyId, jobId)).toBe(EMPLOYER_APPROVED_COMPANIES[candidates[0].companyId]);
  expect(getEmployerApproval('synthetic-unapproved-company', jobId)).toBeNull();
});

it('retains Nobu Barbuda company-wide approval as explicitly owner-attested', () => {
  expect(getEmployerApproval('9fde7fc7-70b3-4354-9d11-d520f4ec09f9', 'synthetic-nobu-vacancy')).toEqual({
    companyName: 'Nobu Barbuda',
    approvedOn: '2026-10-05',
  });
});

it.each([
  ['2026-10-29T03:59:59.999Z', true],
  ['2026-10-29T04:00:00.000Z', false],
  ['2026-10-30T12:00:00.000Z', false],
] as const)('retires Woodstock markup at its date-only Antigua deadline: %s', async (now, eligible) => {
  vi.setSystemTime(new Date(now));
  db.job = makeJob(candidates[1]);
  const data = await schemas();
  expect(data.some((schema) => schema['@type'] === 'JobPosting')).toBe(eligible);
  expect(data.some((schema) => schema['@type'] === 'BreadcrumbList')).toBe(true);
  expect(await pageHtml()).not.toContain('Apply before: 29 October 2026');
  expect(await pageHtml()).toContain('Sign In to Apply');
  expect(db.job.description).toContain('Apply before: 29 October 2026');
});

it('does not impose Woodstock\'s deadline on MOfit', async () => {
  vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  expect((await schemas())[0]['@type']).toBe('JobPosting');
  expect((await schemas())[0]).not.toHaveProperty('validThrough');
});


it.each([
  ['2026-10-03T03:59:59.999Z', true],
  ['2026-10-04T03:59:59.999Z', true],
  ['2026-10-04T04:00:00.000Z', false],
  ['2026-10-10T04:00:00.000Z', false],
] as const)('limits Top Bun Google markup to its public deadline, keeping page and Apply: %s', async (now, eligible) => {
  vi.setSystemTime(new Date(now));
  db.job!.id = 'e03a2b8c-f69b-42bb-bc43-13a5d0917291';
  db.job!.company_id = '362300b7-c0c5-4c2e-a9f6-6fe79f187e71';
  db.job!.company.id = db.job!.company_id;
  db.job!.company.company_name = 'Top Bun Antigua';
  db.job!.title = 'Cook (Part time, Saturday only)';
  db.job!.description = 'Cook on Saturdays only. Application deadline: October 3, 2026.';
  const before = structuredClone(db.job);
  const data = await schemas();
  expect(data.some(schema => schema['@type'] === 'JobPosting')).toBe(eligible);
  expect(data.some(schema => schema['@type'] === 'BreadcrumbList')).toBe(true);
  if (eligible) expect(data[0]).toMatchObject({ validThrough: '2026-10-03', employmentType: 'PART_TIME' });
  const html = await pageHtml();
  expect(html).not.toContain('Application deadline: October 3, 2026.');
  expect(html).toContain('Cook on Saturdays only.');
  expect(html).toContain('Sign In to Apply');
  expect(html).toContain('Part Time');
  expect(db.job).toEqual(before);
});

it.each([
  'Application deadline: October 3, 2026.',
  'Apply before: 29 October 2026',
  'Application deadline: 30 October 2026.',
  'Applications close October 30, 2026.',
])('keeps visible text, metadata and schema descriptions consistent while retaining source facts: %s', async deadline => {
  db.job!.description = `Work Saturdays, 8am–4pm.\n\n${deadline}\n\nEmail office@example.com to apply.`;
  const before = structuredClone(db.job);
  const expected = 'Work Saturdays, 8am–4pm.\n\nEmail office@example.com to apply.';
  const html = await pageHtml();
  const page = document.createElement('div');
  page.innerHTML = html;
  expect(page.querySelector('.whitespace-pre-wrap')?.textContent).toBe(expected);
  expect(html).not.toContain(deadline);
  const schema = (await schemas()).find(schema => schema['@type'] === 'JobPosting');
  expect(schema.description).toBe('<p>Work Saturdays, 8am–4pm.</p><p>Email office@example.com to apply.</p>');
  const metadata = await generateMetadata({ params: Promise.resolve({ id: db.job!.id }) });
  expect(metadata.description).toContain(expected.replace(/\s+/g, ' '));
  expect(metadata.description).not.toContain(deadline);
  expect(db.job).toEqual(before);
});

it('does not impose the Top Bun deadline on another company or vacancy', async () => {
  vi.setSystemTime(new Date('2026-10-10T04:00:00Z'));
  db.job!.company_id = '362300b7-c0c5-4c2e-a9f6-6fe79f187e71';
  db.job!.company.id = db.job!.company_id;
  db.job!.id = 'synthetic-another-top-bun-vacancy';
  expect((await schemas())[0]['@type']).toBe('JobPosting');
  expect((await schemas())[0]).not.toHaveProperty('validThrough');
  db.job!.id = 'e03a2b8c-f69b-42bb-bc43-13a5d0917291';
  db.job!.company_id = candidates[0].companyId;
  db.job!.company.id = db.job!.company_id;
  expect((await schemas())[0]['@type']).toBe('JobPosting');
  expect((await schemas())[0]).not.toHaveProperty('validThrough');
});

it.each([
  ['ade78a5c-e0f6-4f5f-8008-117d7a4b96ee', '1b68107a-228a-4e97-b047-d4c14bd730ef', 'Application deadline: 30 October 2026.'],
  ['d4fdb396-a0b0-427d-aae0-ed756274375e', '42e58a5e-3f56-4f2b-b829-b9b335d45b81', 'Applications close October 30, 2026.'],
])('keeps an unapproved import excluded after hiding its preserved deadline: %s', async (jobId, companyId, deadline) => {
  db.job!.id = jobId;
  db.job!.company_id = companyId;
  db.job!.company.id = db.job!.company_id;
  db.job!.description = `Assist customers. ${deadline}`;
  const before = structuredClone(db.job);
  expect(getEmployerApproval(companyId, jobId)).toBeNull();
  expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  expect(await pageHtml()).toContain('Sign In to Apply');
  expect(await pageHtml()).not.toContain(deadline);
  expect(db.job).toEqual(before);
});

describe('Star Times Driver Guide vacancy-scoped approval', () => {
  const companyId = 'e9703c50-bfef-41fb-99f1-5ba9387418c2';
  const jobId = '232f9e93-d28c-4e8b-bdb5-3c85093e61d6';
  beforeEach(() => {
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = 'Star Times Adventure Tours';
    db.job!.title = 'Driver Guide';
  });
  it('authorizes only the recorded vacancy without asserting the placeholder employment type', async () => {
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn: '2026-10-06', employmentTypeUnconfirmed: true,
      evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/25',
    });
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false });
    expect(schema).not.toHaveProperty('employmentType');
    expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
  });
  it('excludes other current and future Star Times imports', async () => {
    db.job!.id = 'synthetic-other-star-times-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('restores confirmed employmentType only when the uncertainty flag is removed', async () => {
    EMPLOYER_APPROVED_JOBS[jobId] = { ...EMPLOYER_APPROVED_JOBS[jobId], employmentTypeUnconfirmed: false };
    expect((await schemas())[0].employmentType).toBe('FULL_TIME');
  });
});
