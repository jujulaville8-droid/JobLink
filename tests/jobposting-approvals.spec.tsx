import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JobDetailPage, { generateMetadata } from '@/app/jobs/[id]/page';
import observedJobs from './fixtures/approved-job-listings.json';
import { publicVacancyDescription } from '@/lib/public-vacancy-description';
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

describe('job location fallback', () => {
  it('uses the company address in JobPosting and on the page when the job has no location', async () => {
    const job = makeJob(candidates[1]);
    db.job = { ...job, location: null, company: { ...job.company, location: 'English Harbour, Antigua' } };
    const data = await schemas();
    expect(data[0].jobLocation.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'English Harbour', addressCountry: 'AG' });
    const html = await pageHtml();
    expect(html).toContain('English Harbour, Antigua');
    expect(html).not.toContain('Location not provided');
  });

  it('prefers the job location over the company address', async () => {
    const job = makeJob(candidates[1]);
    db.job = { ...job, location: "Crabb's Peninsula, Antigua" as unknown as null, company: { ...job.company, location: 'English Harbour, Antigua' } };
    expect((await schemas())[0].jobLocation.address.addressLocality).toBe("Crabb's Peninsula");
  });

  it('omits the locality and says so when neither is recorded', async () => {
    const job = makeJob(candidates[1]);
    db.job = { ...job, location: null, company: { ...job.company, location: '' } };
    expect((await schemas())[0].jobLocation.address).not.toHaveProperty('addressLocality');
    expect(await pageHtml()).toContain('Location not provided');
  });
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
    const expectedDescription = publicVacancyDescription(candidate.job);
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
  expect(metadata.title).not.toEqual({ absolute: 'Job Not Found | JobLink' });
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
] as const)('limits Top Bun Google markup to its public deadline and closes the page after it: %s', async (now, eligible) => {
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
  if (eligible) expect(html).toContain('Sign In to Apply');
  else {
    expect(html).toContain('This job is no longer available');
    expect(html).not.toContain('Sign In to Apply');
  }
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

describe.each([
  ['ade78a5c-e0f6-4f5f-8008-117d7a4b96ee', '1b68107a-228a-4e97-b047-d4c14bd730ef', 'Shhatterr Shack Rage Room', 'Application deadline: 30 October 2026.', '2026-10-08', true],
  ['d4fdb396-a0b0-427d-aae0-ed756274375e', '42e58a5e-3f56-4f2b-b829-b9b335d45b81', 'Food Brokerage Services Ltd.', 'Applications close October 30, 2026.', '2026-10-09', false],
])('%s vacancy-scoped approval with a preserved deadline', (jobId, companyId, companyName, deadline, attestedOn, unconfirmed) => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = companyName;
    db.job!.job_type = 'full_time';
    db.job!.description = `Assist customers. ${deadline}`;
  });
  it('emits JobPosting for only the recorded vacancy with its date-only deadline', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({ companyId, attestedOn });
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, validThrough: '2026-10-30', directApply: false });
    if (unconfirmed) expect(schema).not.toHaveProperty('employmentType');
    else expect(schema.employmentType).toBe('FULL_TIME');
    expect(schema.description).not.toContain(deadline);
    const html = await pageHtml();
    expect(html).toContain('Sign In to Apply');
    expect(html).not.toContain(deadline);
    expect(db.job).toEqual(before);
  });
  it('retires the markup after the Antigua deadline date', async () => {
    vi.setSystemTime(new Date('2026-10-31T05:00:00Z'));
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('excludes other current and future vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
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

describe.each([
  ['03aeffa0-f680-46b2-b5eb-ea3891d0ce44', '6b354ee5-ff32-44b3-a5c8-29f73650b51a', 'Street Blends', 'Barista Prep Assistants', undefined],
  ['40b28447-7653-4646-bc21-b8f0653d9409', '22a1fd24-ef01-4b55-8043-1cdca65bc25c', 'Hermitage Bay', 'Line Cook', undefined],
])('%s October 12 vacancy-scoped approval', (jobId, companyId, companyName, title, validThrough) => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-12T22:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = companyName;
    db.job!.title = title;
    db.job!.job_type = 'full_time';
  });
  it('emits JobPosting for only the recorded vacancy without the placeholder employment type', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn: '2026-10-12', employmentTypeUnconfirmed: true,
      evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/41',
    });
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false });
    expect(schema).not.toHaveProperty('employmentType');
    if (validThrough) expect(schema.validThrough).toBe(validThrough);
    else expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
    expect(db.job).toEqual(before);
  });
  it('excludes other current and future vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  if (validThrough) {
    it('retires the markup after the Antigua deadline date', async () => {
      vi.setSystemTime(new Date('2026-10-16T05:00:00Z'));
      expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
    });
  }
});

describe.each([
  ['97fec756-f008-4409-8e77-155a334d6f43', 'Chef de Partie'],
  ['ddcfe8d3-f258-4447-9161-08e224a1a81a', 'Jr. Sous Chef'],
])('Hermitage Bay %s October 13 vacancy-scoped approval', (jobId, title) => {
  const companyId = '22a1fd24-ef01-4b55-8043-1cdca65bc25c';
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-13T20:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = 'Hermitage Bay';
    db.job!.title = title;
    db.job!.job_type = 'full_time';
  });
  it('emits JobPosting with the confirmed employment type and no deadline', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn: '2026-10-13', evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/45',
    });
    expect(EMPLOYER_APPROVED_JOBS[jobId].employmentTypeUnconfirmed).toBeUndefined();
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false, employmentType: 'FULL_TIME' });
    expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
    expect(db.job).toEqual(before);
  });
  it('excludes other vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
});

describe.each([
  ['7181a600-df8e-45dd-b8d1-a0e910c1f494', '8b95a031-0ce5-4e2d-9087-fda18d2ccc7c', 'Seagull Inflatables', 'Operations & Admin Coordinator', undefined, false],
  ['66737b60-cf1a-4fd0-980c-14f1c9412923', 'ea87a75a-dece-4fd6-afa7-64efbd51a88d', "Antigua's Donkey Sanctuary", 'Team Member (Visitor Services & Gift Shop)', undefined, true],
])('%s October 14 vacancy-scoped approval', (jobId, companyId, companyName, title, validThrough, unconfirmed) => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-15T14:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = companyName;
    db.job!.title = title;
    db.job!.job_type = 'full_time';
  });
  it('emits JobPosting for only the recorded vacancy with the right employment type and deadline', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn: '2026-10-14', evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/55',
    });
    expect(EMPLOYER_APPROVED_JOBS[jobId].employmentTypeUnconfirmed).toBe(unconfirmed ? true : undefined);
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false });
    if (unconfirmed) expect(schema).not.toHaveProperty('employmentType');
    else expect(schema.employmentType).toBe('FULL_TIME');
    if (validThrough) expect(schema.validThrough).toBe(validThrough);
    else expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
    expect(db.job).toEqual(before);
  });
  it('excludes other current and future vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  if (validThrough) {
    it('retires the markup after the Antigua deadline date', async () => {
      vi.setSystemTime(new Date('2026-10-19T05:00:00Z'));
      expect((await schemas()).map(schema => schema['@type'])).not.toContain('JobPosting');
    });
  }
});

describe.each([
  ['c38baf47-a23c-4908-b2ed-c80163d6b06d', 'Experienced Chef (Nights)'],
  ['ab781b7c-5c68-404f-bb7c-479a8b58264f', 'Kitchen Staff (Nights)'],
])('%s October 15 Trappas vacancy-scoped approval', (jobId, title) => {
  const companyId = 'a528f079-6706-4e64-a351-eabcc47359f4';
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-16T14:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = 'Trappas Restaurant and Bar';
    db.job!.title = title;
    db.job!.job_type = 'full_time';
  });
  it('emits JobPosting for only the recorded vacancy without employmentType or deadline', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn: '2026-10-15', evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/65',
    });
    expect(EMPLOYER_APPROVED_JOBS[jobId].employmentTypeUnconfirmed).toBe(true);
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false });
    expect(schema).not.toHaveProperty('employmentType');
    expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
    expect(db.job).toEqual(before);
  });
  it('excludes other current and future vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('stays live well into the future because no closure or deadline is recorded', async () => {
    vi.setSystemTime(new Date('2027-03-01T14:00:00Z'));
    expect((await schemas()).map(schema => schema['@type'])).toContain('JobPosting');
  });
});

describe('7bd1f5b0-4da5-4177-b4c5-3cacc65b904b October 16 North Sound Brewery vacancy-scoped approval', () => {
  const jobId = '7bd1f5b0-4da5-4177-b4c5-3cacc65b904b';
  const companyId = '07533d6c-77cc-4e6e-bdde-14d4fd3923a9';
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-16T16:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = 'North Sound Brewery (Antigua Distillery)';
    db.job!.title = 'Brewmaster';
    db.job!.job_type = 'full_time';
  });
  it('emits JobPosting for only the recorded vacancy with FULL_TIME and no deadline', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn: '2026-10-16', evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/67',
    });
    expect(EMPLOYER_APPROVED_JOBS[jobId].employmentTypeUnconfirmed).toBeUndefined();
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false });
    expect(schema.employmentType).toBe('FULL_TIME');
    expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
    expect(db.job).toEqual(before);
  });
  it('excludes other current and future vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('stays live after October 16 because the owner removed the deadline and no closure is recorded', async () => {
    vi.setSystemTime(new Date('2026-10-17T05:00:00Z'));
    expect((await schemas()).map(schema => schema['@type'])).toContain('JobPosting');
    vi.setSystemTime(new Date('2027-03-01T14:00:00Z'));
    expect((await schemas()).map(schema => schema['@type'])).toContain('JobPosting');
  });
});

describe('e080f894-4e7f-48b7-b39a-1a274f52fd97 October 16 Super Service Center vacancy-scoped approval', () => {
  const jobId = 'e080f894-4e7f-48b7-b39a-1a274f52fd97';
  const companyId = '4b3ecdcd-01cc-4b67-8756-dc0247a04473';
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-16T20:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = 'Super Service Center';
    db.job!.title = 'Tire Technician';
    db.job!.job_type = 'full_time';
  });
  it('emits JobPosting for only the recorded vacancy without employmentType or deadline', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn: '2026-10-16', evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/70',
    });
    expect(EMPLOYER_APPROVED_JOBS[jobId].employmentTypeUnconfirmed).toBe(true);
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false });
    expect(schema).not.toHaveProperty('employmentType');
    expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
    expect(db.job).toEqual(before);
  });
  it('excludes other current and future vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('stays live well into the future because no closure or deadline is recorded', async () => {
    vi.setSystemTime(new Date('2027-03-01T14:00:00Z'));
    expect((await schemas()).map(schema => schema['@type'])).toContain('JobPosting');
  });
});

describe("cead1cc1-636b-438b-9c8a-bd39fd02c045 October 16 The Tailor's Daughter vacancy-scoped approval", () => {
  const jobId = 'cead1cc1-636b-438b-9c8a-bd39fd02c045';
  const companyId = 'bda01a15-de79-41fc-b10e-5c4126115860';
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-17T03:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = "The Tailor's Daughter Inc.";
    db.job!.title = 'Part-Time Retail Sales Associate';
    db.job!.job_type = 'part_time';
  });
  it('emits JobPosting for only the recorded vacancy with PART_TIME and no deadline', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn: '2026-10-16', evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/71',
    });
    expect(EMPLOYER_APPROVED_JOBS[jobId].employmentTypeUnconfirmed).toBeUndefined();
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false });
    expect(schema.employmentType).toBe('PART_TIME');
    expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
    expect(db.job).toEqual(before);
  });
  it('excludes other current and future vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('stays live well into the future because no closure or deadline is recorded', async () => {
    vi.setSystemTime(new Date('2027-03-01T14:00:00Z'));
    expect((await schemas()).map(schema => schema['@type'])).toContain('JobPosting');
  });
});

describe.each([
  ['03aeffa0-f680-46b2-b5eb-ea3891d0ce44', '6b354ee5-ff32-44b3-a5c8-29f73650b51a', 'Street Blends', 'Barista Prep Assistants'],
  ['7181a600-df8e-45dd-b8d1-a0e910c1f494', '8b95a031-0ce5-4e2d-9087-fda18d2ccc7c', 'Seagull Inflatables', 'Operations & Admin Coordinator'],
])('%s keeps JobPosting after its old public deadline (no automatic closing)', (jobId, companyId, companyName, title) => {
  beforeEach(() => {
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = companyName;
    db.job!.title = title;
    db.job!.job_type = 'full_time';
  });
  it.each(['2026-10-19T13:00:00Z', '2027-03-01T14:00:00Z'])('emits JobPosting without validThrough at %s', async now => {
    vi.setSystemTime(new Date(now));
    const schema = (await schemas()).find(entry => entry['@type'] === 'JobPosting');
    expect(schema).toMatchObject({ identifier: { value: jobId } });
    expect(schema).not.toHaveProperty('validThrough');
  });
});

describe.each([
  ['d00f5ff5-29cf-4110-9828-a2f84e49245f', '5d2c7dd8-7ff7-4dea-a3c7-22f81cf04eb3', 'The Massage Goddess', 'Nail Technician', '2026-10-19', true],
  ['e81d3a56-c9fe-42dd-99ab-a35398398582', 'd3c66ca7-9066-4f4a-a87c-a307b9d63ab5', 'ELand Courier Services', 'Driver/Office Assistant', '2026-10-17', false],
])('%s October 17–19 vacancy-scoped approval', (jobId, companyId, companyName, title, attestedOn, unconfirmed) => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-19T16:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = companyName;
    db.job!.title = title;
    db.job!.job_type = 'full_time';
  });
  it('emits JobPosting for only the recorded vacancy with the right employment type and no deadline', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn, evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/76',
    });
    expect(EMPLOYER_APPROVED_JOBS[jobId].employmentTypeUnconfirmed).toBe(unconfirmed ? true : undefined);
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false });
    if (unconfirmed) expect(schema).not.toHaveProperty('employmentType');
    else expect(schema.employmentType).toBe('FULL_TIME');
    expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
    expect(db.job).toEqual(before);
  });
  it('excludes other current and future vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('stays live well into the future because no closure or deadline is recorded', async () => {
    vi.setSystemTime(new Date('2027-03-01T14:00:00Z'));
    expect((await schemas()).map(schema => schema['@type'])).toContain('JobPosting');
  });
});

describe.each([
  ['ef5503e9-45a2-4121-92b7-aec94b440147', 'Office Assistant'],
  ['90a1af95-5173-43ce-a5b7-4307814ce881', 'Sales Representative'],
])('%s October 19 CRISPA vacancy-scoped approval', (jobId, title) => {
  const companyId = '08c982be-1421-4657-8394-c168a1f07d61';
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-23T16:00:00Z'));
    db.job!.id = jobId;
    db.job!.company_id = companyId;
    db.job!.company.id = companyId;
    db.job!.company.company_name = 'CRISPA Wholesale Distribution Company Ltd.';
    db.job!.title = title;
    db.job!.job_type = 'full_time';
  });
  it('emits JobPosting for only the recorded vacancy without employmentType or deadline', async () => {
    const before = structuredClone(db.job);
    expect(EMPLOYER_APPROVED_COMPANIES).not.toHaveProperty(companyId);
    expect(getEmployerApproval(companyId, jobId)).toMatchObject({
      companyId, attestedOn: '2026-10-19', evidenceReference: 'https://github.com/jujulaville8-droid/JobLink/pull/PENDING',
    });
    expect(EMPLOYER_APPROVED_JOBS[jobId].employmentTypeUnconfirmed).toBe(true);
    expect(EMPLOYER_APPROVED_JOBS[jobId].validThrough).toBeUndefined();
    const schema = (await schemas())[0];
    expect(schema).toMatchObject({ '@type': 'JobPosting', identifier: { value: jobId }, directApply: false });
    expect(schema).not.toHaveProperty('employmentType');
    expect(schema).not.toHaveProperty('validThrough');
    expect(await pageHtml()).toContain('Sign In to Apply');
    expect(db.job).toEqual(before);
  });
  it('excludes other current and future vacancies at the same company', async () => {
    db.job!.id = 'synthetic-other-vacancy';
    expect(getEmployerApproval(companyId, db.job!.id)).toBeNull();
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('does not carry permission to a different company', async () => {
    db.job!.company_id = 'synthetic-other-company';
    db.job!.company.id = db.job!.company_id;
    expect((await schemas()).map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
  });
  it('stays live well into the future because no closure or deadline is recorded', async () => {
    vi.setSystemTime(new Date('2027-03-01T14:00:00Z'));
    expect((await schemas()).map(schema => schema['@type'])).toContain('JobPosting');
  });
});
