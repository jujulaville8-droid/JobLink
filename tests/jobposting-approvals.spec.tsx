import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JobDetailPage from '@/app/jobs/[id]/page';
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
    expect(description.textContent!.replace(/\s/g, '')).toBe(candidate.job.description.replace(/\s/g, ''));
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

it.each(['2026-09-30T20:09:59Z', '2026-09-30T20:10:00Z'])('returns notFound when expiry %s is reached', async (expiresAt) => {
  db.job!.expires_at = expiresAt;
  await expect(pageHtml()).rejects.toThrow('Not found');
});

it('retains an actual stored future deadline without inventing one', async () => {
  db.job = makeJob(candidates[1]);
  db.job.expires_at = '2026-10-20T12:00:00Z';
  expect((await schemas())[0].validThrough).toBe('2026-10-20T12:00:00.000Z');
});

it('does not emit JobPosting without a hiring organization name', async () => {
  db.job!.company.company_name = '';
  expect((await schemas()).map((schema) => schema['@type'])).toEqual(['BreadcrumbList']);
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
  expect(await pageHtml()).toContain('Apply before: 29 October 2026');
});

it('does not impose Woodstock\'s deadline on MOfit', async () => {
  vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  expect((await schemas())[0]['@type']).toBe('JobPosting');
  expect((await schemas())[0]).not.toHaveProperty('validThrough');
});
