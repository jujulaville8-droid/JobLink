import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JobDetailPage, { generateMetadata } from '@/app/jobs/[id]/page';
import { publicJobDescription } from '@/lib/public-job-description';
import { publicVacancyDescription } from '@/lib/public-vacancy-description';
import { jobMetaDescription } from '@/lib/seo/job-description';
import { getPublicJobDeadline } from '@/lib/seo/public-job-deadlines';
import {
  EMPLOYER_APPROVED_COMPANIES,
  EMPLOYER_APPROVED_JOBS,
  getEmployerApproval,
} from '@/lib/seo/employerApproved';

// Original descriptions were observed in public HTML before the October 10
// deadline-presentation release. Enrichment facts come from the employer posts
// linked in public-vacancy-description.ts, not these synthetic page fields.
const vacancies = [
  {
    id: 'd4fdb396-a0b0-427d-aae0-ed756274375e',
    company_id: '42e58a5e-3f56-4f2b-b829-b9b335d45b81',
    companyName: 'Food Brokerage Services Ltd.',
    title: 'Van Sales Assistant/Operator',
    description: 'Food Brokerage Services Ltd. is hiring a Van Sales Assistant/Operator in Antigua.\n\nApplications close October 30, 2026.',
    expected: `Food Brokerage Services Ltd. is hiring a Van Sales Assistant/Operator in Antigua.

Responsibilities
- Identify and pursue new business opportunities
- Build and maintain strong customer relationships

Requirements
- Must be able to operate a manual truck

Commission
Earn commission when you meet or exceed sales targets.

How to apply: email fbsjobsanu@gmail.com.`,
    employmentTypeUnconfirmed: false,
  },
  {
    id: 'ade78a5c-e0f6-4f5f-8008-117d7a4b96ee',
    company_id: '1b68107a-228a-4e97-b047-d4c14bd730ef',
    companyName: 'Shhatterr Shack Rage Room',
    title: 'Rage Room Attendant',
    description: "Shhatterr Shack Rage Room in St. John's is hiring a Rage Room Attendant.\n\nApplicants must be legally able to work in Antigua and be located in Antigua.\n\nApplication deadline: 30 October 2026.",
    expected: `Shhatterr Shack Rage Room in St. John's is hiring a Rage Room Attendant.

Responsibilities
- Check in customers
- Set up rage-room sessions
- Brief guests on safety rules
- Monitor and assist during sessions
- Reset rooms after each session

Requirements
- Friendly and professional
- Reliable and punctual
- Able to lift up to 20 lb
- Good communication skills
- Enthusiastic about a fun, high-energy environment
- Legally able to work in Antigua and located in Antigua

How to apply: email your CV and a short explanation of why you are a good fit to ssrageroom268@gmail.com. No DMs.`,
    employmentTypeUnconfirmed: true,
  },
];

function makeJob(vacancy = vacancies[0]) {
  return {
    id: vacancy.id, company_id: vacancy.company_id, title: vacancy.title,
    description: vacancy.description,
    status: 'active', posted_by_admin: true,
    // Synthetic non-content fields; this is not a database record snapshot.
    created_at: '2026-10-06T12:00:00Z', expires_at: null,
    job_type: 'full_time', location: 'Antigua', category: null,
    salary_visible: true, salary_min: null, salary_max: null,
    company: {
      id: vacancy.company_id, company_name: vacancy.companyName,
      description: 'Existing employer profile.', location: 'Antigua',
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

const originalApprovals = { ...EMPLOYER_APPROVED_JOBS };
const originalCompanyApprovals = { ...EMPLOYER_APPROVED_COMPANIES };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
});
afterEach(() => {
  for (const id of Object.keys(EMPLOYER_APPROVED_JOBS)) delete EMPLOYER_APPROVED_JOBS[id];
  Object.assign(EMPLOYER_APPROVED_JOBS, originalApprovals);
  vi.useRealTimers();
});

async function renderPage() {
  const page = document.createElement('div');
  page.innerHTML = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: db.job!.id }) }));
  const schemas = [...page.querySelectorAll('script[type="application/ld+json"]')]
    .map(script => JSON.parse(script.textContent!));
  const description = page.querySelector('.whitespace-pre-wrap')?.textContent;
  return { page, schemas, description };
}

describe.each(vacancies)('$companyName verified description fallback', vacancy => {
  it('uses exactly the verified facts without modifying raw source or deadline facts', () => {
    const source = Object.freeze({ ...vacancy });
    expect(publicVacancyDescription(source)).toBe(vacancy.expected);
    expect(source.description).toBe(vacancy.description);
    expect(source.description).toMatch(/October 30, 2026|30 October 2026/);
    expect(getPublicJobDeadline(source.id, source.company_id)).toBe('2026-10-30');
    expect(vacancy.expected).not.toMatch(/October|2026|full.time|part.time|salary|degree|years of experience|hours/i);
    expect(publicVacancyDescription(source)).not.toContain('Imported by');
  });

  it.each([
    { id: 'another-vacancy' },
    { id: undefined },
    { id: 'toString' },
    { company_id: 'another-company' },
    { company_id: undefined },
    { title: 'Updated role title' },
  ])('does not spread enrichment beyond the exact vacancy identity: %j', changes => {
    const source = { ...vacancy, ...changes };
    expect(publicVacancyDescription(source)).toBe(publicJobDescription(vacancy.description));
  });

  it.each(['append', 'replace', 'whitespace', 'deadline', 'remove-deadline', 'empty', 'null'])(
    'lets an employer description edit take precedence: %s', change => {
      const descriptions: Record<string, string | null> = {
        append: `${vacancy.description}\n\nEmployer update: ask about the new role.`,
        replace: 'Updated duties supplied by the employer. Email new@example.com.',
        whitespace: `${vacancy.description}\n`,
        deadline: vacancy.description.replace('30', '31'),
        'remove-deadline': publicJobDescription(vacancy.description),
        empty: '',
        null: null,
      };
      const source = Object.freeze({ ...vacancy, description: descriptions[change] });
      expect(publicVacancyDescription(source)).toBe(publicJobDescription(source.description));
      expect(source.description).toBe(descriptions[change]);
    },
  );

  it('renders the same enriched text in body and metadata while approvals stay unchanged and no JobPosting is emitted', async () => {
    db.job = makeJob(vacancy);
    const before = structuredClone(db.job);
    const { page, schemas, description } = await renderPage();
    const metadata = await generateMetadata({ params: Promise.resolve({ id: vacancy.id }) });
    const expectedMeta = jobMetaDescription({
      title: vacancy.title, companyName: vacancy.companyName,
      location: db.job.location, description: vacancy.expected,
    });
    expect(description).toBe(vacancy.expected);
    expect(metadata.description).toBe(expectedMeta);
    expect(metadata.openGraph?.description).toBe(expectedMeta);
    expect(metadata.twitter?.description).toBe(expectedMeta);
    expect(metadata.description).toContain('Responsibilities');
    expect(page.textContent).toContain('Sign In to Apply');
    expect(db.job.company.description).toBe('Existing employer profile.');
    expect(page.textContent).not.toContain('October');
    expect(schemas.map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
    expect(getEmployerApproval(vacancy.company_id, vacancy.id)).toBeNull();
    expect(EMPLOYER_APPROVED_JOBS).toEqual(originalApprovals);
    expect(EMPLOYER_APPROVED_COMPANIES).toEqual(originalCompanyApprovals);
    expect(db.job).toEqual(before);
  });

  it('keeps representation parity under synthetic approval, without asserting Google policy readiness', async () => {
    db.job = makeJob(vacancy);
    const before = structuredClone(db.job);
    // In-memory representation test only: no production approval is introduced.
    // Known deadlines still require visibility-policy remediation before these
    // listings can claim Google policy readiness. This does not test eligibility.
    EMPLOYER_APPROVED_JOBS[vacancy.id] = {
      companyId: vacancy.company_id, companyName: vacancy.companyName,
      attestedOn: '2026-10-10', evidenceReference: 'synthetic-test-approval',
      employmentTypeUnconfirmed: vacancy.employmentTypeUnconfirmed,
    };
    const { schemas, description } = await renderPage();
    const schema = schemas.find(item => item['@type'] === 'JobPosting');
    expect(schema).toBeDefined();
    const schemaBody = document.createElement('div');
    schemaBody.innerHTML = schema.description;
    for (const br of schemaBody.querySelectorAll('br')) br.replaceWith('\n');
    const schemaDescription = [...schemaBody.querySelectorAll('p')].map(p => p.textContent).join('\n\n');
    expect(schemaDescription).toBe(vacancy.expected);
    expect(schemaDescription).toBe(description);
    expect(schema.validThrough).toBe('2026-10-30');
    expect(schema.datePosted).toBe(before.created_at);
    expect(schema).not.toHaveProperty('baseSalary');
    if (vacancy.employmentTypeUnconfirmed) expect(schema).not.toHaveProperty('employmentType');
    else expect(schema.employmentType).toBe('FULL_TIME');
    expect(db.job).toEqual(before);
  });

  it('preserves employer updates in body and metadata, including after an owner change', async () => {
    db.job = makeJob(vacancy);
    db.job.company.user_id = 'new-owner';
    db.job.description = 'Updated duties supplied by the employer. Email new@example.com.';
    const before = structuredClone(db.job);
    const { description, schemas } = await renderPage();
    const metadata = await generateMetadata({ params: Promise.resolve({ id: vacancy.id }) });
    expect(description).toBe(db.job.description);
    expect(metadata.description).toContain(db.job.description);
    expect(schemas.map(schema => schema['@type'])).toEqual(['BreadcrumbList']);
    expect(db.job).toEqual(before);
  });
});
