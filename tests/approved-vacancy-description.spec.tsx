import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JobDetailPage, { generateMetadata } from '@/app/jobs/[id]/page';
import { publicVacancyDescription } from '@/lib/public-vacancy-description';
import { jobMetaDescription } from '@/lib/seo/job-description';
import { getPublicJobDeadline } from '@/lib/seo/public-job-deadlines';
import { hasUnconfirmedEmploymentType } from '@/lib/seo/unconfirmed-employment-types';
import { EMPLOYER_APPROVED_COMPANIES, EMPLOYER_APPROVED_JOBS } from '@/lib/seo/employerApproved';

// Source descriptions and original posted dates were read from the saved
// October 10 public production HTML. The expected facts are from the verified
// employer adverts linked in public-vacancy-description.ts.
const vacancies = [
  {
    id: '232f9e93-d28c-4e8b-bdb5-3c85093e61d6',
    company_id: 'e9703c50-bfef-41fb-99f1-5ba9387418c2',
    companyName: 'Star Times Adventure Tours', title: 'Driver Guide',
    location: "St. John's, Antigua", created_at: '2026-10-06T15:38:31.353822+00:00',
    schemaEmploymentType: undefined,
    description: "Star Times Adventure Tours, based at Heritage Quay in St. John's, runs island tours, beach days and excursions for cruise and hotel guests across Antigua. They're hiring a Driver Guide.\n\nTo apply, email Ceostartimesadventuretours@gmail.com",
    expected: `Star Times Adventure Tours in St. John's, Antigua is hiring a Driver Guide.

Responsibilities
- Safely transport guests on excursions
- Give friendly, informative island tours
- Assist during activities and excursions
- Create a fun, welcoming and memorable experience
- Represent the company professionally

Requirements
- Valid driver's licence
- Strong swimmer
- Safe and responsible driver
- Friendly and professional
- Excellent customer service
- Reliable and punctual

Advantages and training
Knowledge of Antigua and its attractions and bilingual ability are advantages. Guiding or hospitality experience is an advantage; otherwise, training is provided.

How to apply: email your CV to Ceostartimesadventuretours@gmail.com.`,
  },
  {
    id: '318d3b16-6aff-453c-b0d3-fc5f2d779783',
    company_id: '1b11e815-e80b-4b35-affe-55c1d1fc16db',
    companyName: 'MOfit Gym and Fitness Centre', title: 'Gym Attendant',
    location: 'Vista, Antigua', created_at: '2026-09-29T22:08:08.998576+00:00',
    schemaEmploymentType: 'FULL_TIME',
    description: 'MOfit Gym and Fitness Centre in Vista, Antigua is hiring a full-time Gym Attendant.\n\nHow to apply: send your CV and a short note to mofit268@outlook.com.',
    expected: `MOfit Gym and Fitness Centre in Vista, Antigua is hiring a full-time Gym Attendant.

Responsibilities
- Maintain a clean, positive and safe workout environment
- Provide accurate information about schedules, memberships and rules
- Assist with equipment use and basic exercise guidance
- Process payments, maintain records and handle other administrative tasks

Requirements
- Age 18 or older
- High school diploma
- Excellent communication and interpersonal skills
- Positive, enthusiastic attitude
- Able to multitask and prioritize
- Basic computer literacy and data-entry skills
- Basic knowledge of fitness equipment and terminology
- Team player

How to apply: send your CV and a short note to mofit268@outlook.com.`,
  },
  {
    id: '0d1245af-a425-4a7f-b670-15dc8c275993',
    company_id: '9fde7fc7-70b3-4354-9d11-d520f4ec09f9',
    companyName: 'Nobu Barbuda', title: 'Executive Chef (Japanese & Peruvian cuisine)',
    location: 'Barbuda', created_at: '2026-10-05T15:07:41.000956+00:00',
    // The stored type is an unconfirmed assumption; optional markup is omitted.
    schemaEmploymentType: undefined,
    description: 'Executive Chef (Japanese & Peruvian cuisine)\nNobu Barbuda, Barbuda\nHow to apply: email EMANOUSOU@NOBUHOTELS.COM',
    expected: `Nobu Barbuda in Barbuda is hiring an Executive Chef (Japanese & Peruvian cuisine).

Requirements and responsibilities
- Schooled in Japanese and Peruvian cuisine
- At least 6 years of experience at a high-volume restaurant
- Ability to train
- Perform cost control and profit-and-loss responsibilities

How to apply: email EMANOUSOU@NOBUHOTELS.COM.`,
  },
];

function makeJob(vacancy = vacancies[0]) {
  return {
    id: vacancy.id, company_id: vacancy.company_id, title: vacancy.title,
    description: vacancy.description, created_at: vacancy.created_at,
    // Remaining fields form a synthetic active page fixture; no DB is used.
    status: 'active', posted_by_admin: true, expires_at: null,
    job_type: 'full_time', location: vacancy.location, category: null,
    salary_visible: true, salary_min: null, salary_max: null,
    company: {
      id: vacancy.company_id, company_name: vacancy.companyName,
      description: 'Existing employer profile.', location: vacancy.location,
      user_id: 'synthetic-owner', logo_url: null, industry: null,
      is_verified: false, website: null,
    },
  };
}

const db = vi.hoisted(() => ({ job: null as ReturnType<typeof makeJob> | null }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: db.job }) }) }) }),
}) }));

const originalApprovals = structuredClone(EMPLOYER_APPROVED_JOBS);
const originalCompanyApprovals = structuredClone(EMPLOYER_APPROVED_COMPANIES);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); });

async function publicRepresentations() {
  const page = document.createElement('div');
  page.innerHTML = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: db.job!.id }) }));
  const schemas = [...page.querySelectorAll('script[type="application/ld+json"]')]
    .map(script => JSON.parse(script.textContent!));
  const schema = schemas.find(item => item['@type'] === 'JobPosting');
  const schemaBody = document.createElement('div');
  schemaBody.innerHTML = schema.description;
  for (const br of schemaBody.querySelectorAll('br')) br.replaceWith('\n');
  const schemaDescription = [...schemaBody.querySelectorAll('p')].map(p => p.textContent).join('\n\n');
  const metadata = await generateMetadata({ params: Promise.resolve({ id: db.job!.id }) });
  return { page, schemas, schema, schemaDescription, metadata };
}

describe.each(vacancies)('$companyName already-approved description fallback', vacancy => {
  it('adds exactly the sourced facts while preserving the original record and absence of a deadline', () => {
    const source = Object.freeze({ ...vacancy });
    expect(publicVacancyDescription(source)).toBe(vacancy.expected);
    expect(source.description).toBe(vacancy.description);
    expect(getPublicJobDeadline(source.id, source.company_id)).toBeUndefined();
    expect(vacancy.expected).not.toMatch(/salary|hours|deadline|October|2026/i);
    if (vacancy.title !== 'Gym Attendant') expect(vacancy.expected).not.toMatch(/full.time|part.time/);
  });

  it.each([
    { id: 'another-vacancy' }, { id: undefined }, { id: 'toString' },
    { company_id: 'another-company' }, { company_id: undefined },
    { title: 'Updated role title' },
  ])('does not spread enrichment beyond exact identity: %j', changes => {
    expect(publicVacancyDescription({ ...vacancy, ...changes })).toBe(vacancy.description);
  });

  it.each(['append', 'replace', 'whitespace', 'empty', 'null'])(
    'lets an employer edit replace the fallback: %s', change => {
      const descriptions: Record<string, string | null> = {
        append: `${vacancy.description}\n\nEmployer update: new duties apply.`,
        replace: 'Updated duties from the employer. Email new@example.com.',
        whitespace: `${vacancy.description}\n`, empty: '', null: null,
      };
      const source = Object.freeze({ ...vacancy, description: descriptions[change] });
      expect(publicVacancyDescription(source)).toBe(source.description ?? '');
      expect(source.description).toBe(descriptions[change]);
    },
  );

  it('retains existing JobPosting with full body/schema parity, matching metadata and original posted date', async () => {
    db.job = makeJob(vacancy);
    const before = structuredClone(db.job);
    const { page, schemas, schema, schemaDescription, metadata } = await publicRepresentations();
    expect(schemas.map(item => item['@type'])).toEqual(['JobPosting', 'BreadcrumbList']);
    expect(page.querySelector('.whitespace-pre-wrap')?.textContent).toBe(vacancy.expected);
    expect(schemaDescription).toBe(vacancy.expected);
    const expectedMeta = jobMetaDescription({
      title: vacancy.title, companyName: vacancy.companyName,
      location: vacancy.location, description: vacancy.expected,
    });
    expect(metadata.description).toBe(expectedMeta);
    expect(metadata.openGraph?.description).toBe(expectedMeta);
    expect(metadata.twitter?.description).toBe(expectedMeta);
    expect(metadata.description).toMatch(/responsibilities/i);
    expect(schema.datePosted).toBe(vacancy.created_at);
    expect(schema).not.toHaveProperty('validThrough');
    expect(schema).not.toHaveProperty('baseSalary');
    if (vacancy.schemaEmploymentType) expect(schema.employmentType).toBe(vacancy.schemaEmploymentType);
    else expect(schema).not.toHaveProperty('employmentType');
    expect(page.textContent).toContain('Sign In to Apply');
    expect(page.textContent).toContain('Full Time'); // Stored/visible type is unchanged.
    expect(EMPLOYER_APPROVED_JOBS).toEqual(originalApprovals);
    expect(EMPLOYER_APPROVED_COMPANIES).toEqual(originalCompanyApprovals);
    expect(db.job).toEqual(before);
  });

  it('keeps an employer update in all representations after an owner change', async () => {
    db.job = makeJob(vacancy);
    db.job.company.user_id = 'new-owner';
    db.job.description = 'Updated employer duties. Email new@example.com.';
    const before = structuredClone(db.job);
    const { page, schemaDescription, metadata } = await publicRepresentations();
    expect(page.querySelector('.whitespace-pre-wrap')?.textContent).toBe(db.job.description);
    expect(schemaDescription).toBe(db.job.description);
    expect(metadata.description).toContain(db.job.description);
    expect(db.job).toEqual(before);
  });
});

describe('Nobu employment-type accuracy exclusion', () => {
  const nobu = vacancies[2];

  it.each([
    [nobu.id, nobu.company_id, true],
    ['another-vacancy', nobu.company_id, false],
    [nobu.id, 'another-company', false],
    [nobu.id, undefined, false],
    [nobu.id, null, false],
    ['toString', nobu.company_id, false],
  ] as const)('binds the exclusion to job %s and company %s', (jobId, companyId, expected) => {
    expect(hasUnconfirmedEmploymentType(jobId, companyId)).toBe(expected);
  });

  it('does not spread the exclusion to another existing or future Nobu vacancy', async () => {
    db.job = { ...makeJob(nobu), id: 'another-nobu-vacancy' };
    const { schema } = await publicRepresentations();
    expect(schema.employmentType).toBe('FULL_TIME');
    expect(schema.description).not.toContain('At least 6 years');
  });

  it('does not carry the exclusion to the same job ID at a different approved company', async () => {
    db.job = makeJob(nobu);
    db.job.company_id = vacancies[1].company_id;
    db.job.company.id = vacancies[1].company_id;
    db.job.company.company_name = vacancies[1].companyName;
    const { schema } = await publicRepresentations();
    expect(schema.employmentType).toBe('FULL_TIME');
    expect(schema.description).not.toContain('At least 6 years');
  });
});

describe('applicantLocationRequirements remote-job scope', () => {
  it.each(['Antigua', 'Vista, Antigua', "St. John's, Antigua", 'Barbuda'])(
    'omits remote geography for an on-site job in %s while retaining physical location', async location => {
      db.job = makeJob(vacancies[1]);
      db.job.location = location;
      const { schema } = await publicRepresentations();
      expect(schema).not.toHaveProperty('applicantLocationRequirements');
      expect(schema).not.toHaveProperty('jobLocationType');
      expect(schema.jobLocation).toMatchObject({
        '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: 'AG' },
      });
      if (location.includes(',')) expect(schema.jobLocation.address.addressLocality).toBe(location.split(',')[0]);
      else expect(schema.jobLocation.address).not.toHaveProperty('addressLocality');
    },
  );

  it.each(['listing', 'company'])('preserves existing remote behavior when the %s supplies remote location', async source => {
    db.job = makeJob(vacancies[1]);
    db.job.location = source === 'listing' ? 'Remote, Antigua' : '';
    db.job.company.location = source === 'company' ? 'Remote, Antigua' : 'Vista, Antigua';
    const { schema } = await publicRepresentations();
    expect(schema.jobLocationType).toBe('TELECOMMUTE');
    expect(schema.applicantLocationRequirements).toEqual({ '@type': 'Country', name: 'Antigua and Barbuda' });
    expect(schema.jobLocation.address).toMatchObject({ addressLocality: 'Remote', addressCountry: 'AG' });
  });
});
