import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { EMPTY_POSTING, listingFields, postingSchema } from '@/lib/job-posting';
import {
  canEmitWidenedFields,
  hasStructuredDataConsent,
  isImportedJobListing,
  widenedJobPostingFields,
} from '@/lib/seo/jobposting-consent';

const state = vi.hoisted(() => ({ job: null as Record<string, unknown> | null }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), notFound: () => { throw new Error('Not found'); } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ error: null, data: state.job }) }) }) }),
}) }));

import JobDetailPage from '@/app/jobs/[id]/page';

function employerPostedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'consent-job',
    company_id: 'consent-company',
    title: 'Line Cook',
    description: 'Cook on the line for a busy kitchen.',
    status: 'active',
    posted_by_admin: false,
    expires_at: null,
    created_at: '2026-10-01T12:00:00Z',
    job_type: 'full_time',
    location: 'St. Johns, Antigua',
    category: 'Tourism & Hospitality',
    salary_visible: true,
    salary_min: 3000,
    salary_max: 4000,
    salary_type: 'monthly',
    benefits: ['Health insurance', 'Meals on duty'],
    structured_data_consent: true,
    structured_data_consent_at: '2026-10-01T11:00:00Z',
    company: {
      id: 'consent-company', company_name: 'Harbour Hotel', logo_url: null,
      description: 'A family run hotel on the harbour.', industry: 'Tourism & Hospitality',
      location: 'St. Johns, Antigua', website: null, is_verified: false,
    },
    ...overrides,
  };
}

beforeEach(() => { state.job = employerPostedJob(); });
afterEach(cleanup);

interface Posting {
  [key: string]: unknown;
  hiringOrganization: Record<string, unknown>;
  baseSalary: { value: Record<string, unknown> };
}

async function renderPosting(): Promise<Posting | undefined> {
  const { container } = render(await JobDetailPage({ params: Promise.resolve({ id: 'consent-job' }) }));
  const script = [...container.querySelectorAll('script[type="application/ld+json"]')]
    .map(node => JSON.parse(node.textContent ?? '{}'))
    .find(data => data['@type'] === 'JobPosting');
  return script as Posting | undefined;
}

describe('widened JobPosting fields with employer consent', () => {
  it('emits the widened fields for an employer posted listing with consent', async () => {
    const posting = await renderPosting();
    expect(posting).toBeDefined();
    expect(posting!.jobBenefits).toBe('Health insurance, Meals on duty');
    expect(posting!.hiringOrganization.description).toBe('A family run hotel on the harbour.');
    // Base markup is untouched.
    expect(posting!.title).toBe('Line Cook');
    expect(posting!.datePosted).toBe('2026-10-01T12:00:00Z');
    expect(posting!.employmentType).toBe('FULL_TIME');
    expect(posting!.baseSalary.value.minValue).toBe(3000);
    expect(posting!.baseSalary.value.maxValue).toBe(4000);
  });

  it('keeps exactly the current markup when consent is not recorded', async () => {
    const withConsent = await renderPosting();
    cleanup();
    state.job = employerPostedJob({ structured_data_consent: false, structured_data_consent_at: null });
    const withoutConsent = await renderPosting();

    expect(withoutConsent).toBeDefined();
    expect(Object.hasOwn(withoutConsent!, 'jobBenefits')).toBe(false);
    expect(Object.hasOwn(withoutConsent!.hiringOrganization, 'description')).toBe(false);

    // Removing the two widened additions from the consented markup leaves a
    // schema identical to the no-consent markup: nothing else changed.
    const stripped = structuredClone(withConsent!);
    delete stripped.jobBenefits;
    delete stripped.hiringOrganization.description;
    expect(stripped).toEqual(withoutConsent);
  });

  it('emits no widened fields for an imported listing even with consent and data present', async () => {
    state.job = employerPostedJob({ posted_by_admin: true });
    const posting = await renderPosting();
    // Imported listings without a registry approval emit no JobPosting markup
    // at all, exactly as before; consent never widens them.
    expect(posting).toBeUndefined();
  });

  it('treats the standard import footer as imported even with consent recorded', async () => {
    state.job = employerPostedJob({
      description: 'Cook on the line for a busy kitchen.\n\nImported by JobLink from a public job post.',
    });
    const posting = await renderPosting();
    expect(posting).toBeUndefined();
  });

  it('shows the widened values visibly on the page itself', async () => {
    const { container } = render(await JobDetailPage({ params: Promise.resolve({ id: 'consent-job' }) }));
    // Structured data must match what a reader can see: check the page with
    // every script element removed, so JSON-LD content cannot satisfy this.
    const visible = container.cloneNode(true) as HTMLElement;
    visible.querySelectorAll('script').forEach(node => node.remove());
    expect(visible.textContent).toContain('Health insurance');
    expect(visible.textContent).toContain('Meals on duty');
    expect(visible.textContent).toContain('A family run hotel on the harbour.');
  });

  it('never invents widened fields when the data is absent', async () => {
    state.job = employerPostedJob({
      benefits: [],
      company: {
        id: 'consent-company', company_name: 'Harbour Hotel', logo_url: null,
        description: null, industry: 'Tourism & Hospitality',
        location: 'St. Johns, Antigua', website: null, is_verified: false,
      },
    });
    const posting = await renderPosting();
    expect(posting).toBeDefined();
    expect(Object.hasOwn(posting!, 'jobBenefits')).toBe(false);
    expect(Object.hasOwn(posting!.hiringOrganization, 'description')).toBe(false);
  });
});

describe('structured data consent helpers', () => {
  it('recognises imported listings both ways', () => {
    expect(isImportedJobListing({ posted_by_admin: true, description: 'Anything.' })).toBe(true);
    expect(isImportedJobListing({ posted_by_admin: false, description: 'Imported by JobLink from a public job post.' })).toBe(true);
    expect(isImportedJobListing({ posted_by_admin: false, description: 'Written by the employer.' })).toBe(false);
  });

  it('requires employer posted plus recorded consent', () => {
    expect(hasStructuredDataConsent({ structured_data_consent: true, posted_by_admin: false, description: 'Own post.' })).toBe(true);
    expect(hasStructuredDataConsent({ structured_data_consent: false, posted_by_admin: false, description: 'Own post.' })).toBe(false);
    expect(hasStructuredDataConsent({ structured_data_consent: null, posted_by_admin: false, description: 'Own post.' })).toBe(false);
    expect(hasStructuredDataConsent({ structured_data_consent: true, posted_by_admin: true, description: 'Own post.' })).toBe(false);
    expect(hasStructuredDataConsent({ structured_data_consent: true, posted_by_admin: false, description: 'Imported by JobLink from a public job post.' })).toBe(false);
  });

  it('builds widened fields only from data that is present', () => {
    expect(widenedJobPostingFields({ benefits: [' Health insurance ', '', 'Meals on duty'] }, { description: '  About us. ' }))
      .toEqual({ jobBenefits: 'Health insurance, Meals on duty', hiringOrganizationDescription: 'About us.' });
    expect(widenedJobPostingFields({ benefits: 'not-an-array' }, { description: null })).toEqual({});
    expect(widenedJobPostingFields({ benefits: [] }, null)).toEqual({});
    expect(widenedJobPostingFields({}, { description: '   ' })).toEqual({});
  });
});

describe('approval stand in for admin posted listings', () => {
  // The real per vacancy registry pair for COLIBRI Chef de Partie in
  // lib/seo/employerApproved.ts (approval recorded 2026-10-28). Admin posted
  // listings can never carry form consent, so the recorded approval is what
  // permits the widened fields.
  function adminPostedApprovedJob(overrides: Record<string, unknown> = {}) {
    return employerPostedJob({
      id: '03cdd5df-68aa-4463-a367-04ccd83753ea',
      company_id: 'eda48543-634b-4687-9947-3aa970d46e97',
      title: 'Chef de Partie',
      posted_by_admin: true,
      structured_data_consent: false,
      structured_data_consent_at: null,
      company: {
        id: 'eda48543-634b-4687-9947-3aa970d46e97', company_name: 'COLIBRI', logo_url: null,
        description: 'A beachfront restaurant and bar.', industry: 'Tourism & Hospitality',
        location: 'St. Johns, Antigua', website: null, is_verified: false,
      },
      ...overrides,
    });
  }

  it('emits the widened fields for an admin posted listing with a recorded approval', async () => {
    state.job = adminPostedApprovedJob();
    const posting = await renderPosting();
    expect(posting).toBeDefined();
    expect(posting!.jobBenefits).toBe('Health insurance, Meals on duty');
    expect(posting!.hiringOrganization.description).toBe('A beachfront restaurant and bar.');
  });

  it('does not widen an admin posted listing with no approval record', async () => {
    state.job = adminPostedApprovedJob({
      id: 'unapproved-job',
      company_id: 'unapproved-company',
      company: {
        id: 'unapproved-company', company_name: 'Unapproved Co', logo_url: null,
        description: 'A beachfront restaurant and bar.', industry: 'Tourism & Hospitality',
        location: 'St. Johns, Antigua', website: null, is_verified: false,
      },
    });
    const posting = await renderPosting();
    expect(posting).toBeUndefined();
  });

  it('does not widen when the recorded approval names a different company', async () => {
    state.job = adminPostedApprovedJob({
      company_id: 'eda48543-634b-4687-9947-3aa970d46e97-other',
      company: {
        id: 'eda48543-634b-4687-9947-3aa970d46e97-other', company_name: 'COLIBRI', logo_url: null,
        description: 'A beachfront restaurant and bar.', industry: 'Tourism & Hospitality',
        location: 'St. Johns, Antigua', website: null, is_verified: false,
      },
    });
    const posting = await renderPosting();
    expect(posting).toBeUndefined();
  });

  it('gates the stand in on imported plus a recorded approval', () => {
    const approval = { companyId: 'any-company' };
    expect(canEmitWidenedFields({ structured_data_consent: true, posted_by_admin: false, description: 'Own post.' }, null)).toBe(true);
    expect(canEmitWidenedFields({ structured_data_consent: false, posted_by_admin: false, description: 'Own post.' }, approval)).toBe(false);
    expect(canEmitWidenedFields({ structured_data_consent: false, posted_by_admin: true, description: 'Team post.' }, approval)).toBe(true);
    expect(canEmitWidenedFields({ structured_data_consent: false, posted_by_admin: true, description: 'Team post.' }, null)).toBe(false);
    expect(canEmitWidenedFields({ structured_data_consent: false, posted_by_admin: false, description: 'Imported by JobLink from a public job post.' }, approval)).toBe(true);
    expect(canEmitWidenedFields({ structured_data_consent: true, posted_by_admin: true, description: 'Team post.' }, null)).toBe(false);
  });
});

describe('email redaction and company wide approvals', () => {
  it('redacts emails from widened fields built by the helper', () => {
    expect(widenedJobPostingFields(
      { benefits: ['Email hr@example.com to apply', 'Health insurance'] },
      { description: 'Reach us at jobs@example.com.' },
    )).toEqual({
      jobBenefits: 'Email [redacted] to apply, Health insurance',
      hiringOrganizationDescription: 'Reach us at [redacted].',
    });
  });

  it('redacts emails in the emitted markup on the consent path, while the page keeps the original text', async () => {
    state.job = employerPostedJob({
      benefits: ['Email hr@example.com to apply'],
      company: {
        id: 'consent-company', company_name: 'Harbour Hotel', logo_url: null,
        description: 'Reach us at jobs@example.com.', industry: 'Tourism & Hospitality',
        location: 'St. Johns, Antigua', website: null, is_verified: false,
      },
    });
    const { container } = render(await JobDetailPage({ params: Promise.resolve({ id: 'consent-job' }) }));
    const script = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map(node => JSON.parse(node.textContent ?? '{}'))
      .find(data => data['@type'] === 'JobPosting') as Posting;
    expect(script.jobBenefits).toBe('Email [redacted] to apply');
    expect(script.hiringOrganization.description).toBe('Reach us at [redacted].');
    // Redaction is markup only: the visible page keeps both addresses as written.
    expect(container.textContent).toContain('hr@example.com');
    expect(container.textContent).toContain('jobs@example.com');
  });

  it('redacts emails in the emitted markup on the approval path as well', async () => {
    state.job = employerPostedJob({
      id: '03cdd5df-68aa-4463-a367-04ccd83753ea',
      company_id: 'eda48543-634b-4687-9947-3aa970d46e97',
      title: 'Chef de Partie',
      posted_by_admin: true,
      structured_data_consent: false,
      structured_data_consent_at: null,
      benefits: ['Apply via chef@colibri.example'],
      company: {
        id: 'eda48543-634b-4687-9947-3aa970d46e97', company_name: 'COLIBRI', logo_url: null,
        description: 'Contact info@colibri.example for details.', industry: 'Tourism & Hospitality',
        location: 'St. Johns, Antigua', website: null, is_verified: false,
      },
    });
    const posting = await renderPosting();
    expect(posting).toBeDefined();
    expect(posting!.jobBenefits).toBe('Apply via [redacted]');
    expect(posting!.hiringOrganization.description).toBe('Contact [redacted] for details.');
  });

  it('widens an admin posted listing under a company wide approval', async () => {
    state.job = employerPostedJob({
      id: 'top-bun-any-vacancy',
      company_id: '362300b7-c0c5-4c2e-a9f6-6fe79f187e71',
      posted_by_admin: true,
      structured_data_consent: false,
      structured_data_consent_at: null,
      company: {
        id: '362300b7-c0c5-4c2e-a9f6-6fe79f187e71', company_name: 'Top Bun Antigua', logo_url: null,
        description: 'A bakery and cafe.', industry: 'Food & Beverage',
        location: 'St. Johns, Antigua', website: null, is_verified: false,
      },
    });
    const posting = await renderPosting();
    expect(posting).toBeDefined();
    expect(posting!.jobBenefits).toBe('Health insurance, Meals on duty');
    expect(posting!.hiringOrganization.description).toBe('A bakery and cafe.');
  });

  it('does not widen an employer posted listing under a company wide approval without form consent', async () => {
    state.job = employerPostedJob({
      company_id: '362300b7-c0c5-4c2e-a9f6-6fe79f187e71',
      structured_data_consent: false,
      structured_data_consent_at: null,
      company: {
        id: '362300b7-c0c5-4c2e-a9f6-6fe79f187e71', company_name: 'Top Bun Antigua', logo_url: null,
        description: 'A bakery and cafe.', industry: 'Food & Beverage',
        location: 'St. Johns, Antigua', website: null, is_verified: false,
      },
    });
    const posting = await renderPosting();
    expect(posting).toBeDefined();
    expect(Object.hasOwn(posting!, 'jobBenefits')).toBe(false);
    expect(Object.hasOwn(posting!.hiringOrganization, 'description')).toBe(false);
  });
});

describe('posting form consent plumbing', () => {
  it('defaults consent to false and parses older payloads without the field', () => {
    expect(EMPTY_POSTING.structured_data_consent).toBe(false);
    const withoutConsent: Record<string, unknown> = { ...EMPTY_POSTING };
    delete withoutConsent.structured_data_consent;
    expect(postingSchema.parse(withoutConsent).structured_data_consent).toBe(false);
  });

  it('carries consent from the form into the listing fields', () => {
    const form = { ...EMPTY_POSTING, title: 'Cook', location: 'St. Johns', description: 'Cook food.', category: 'Tourism & Hospitality', structured_data_consent: true };
    expect(listingFields(form).structured_data_consent).toBe(true);
    expect(listingFields(EMPTY_POSTING).structured_data_consent).toBe(false);
  });
});
