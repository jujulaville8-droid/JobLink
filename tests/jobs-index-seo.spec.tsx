import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { closedJobIdFilter } from '@/lib/job-closures';
import { faqPlainText, jobsIndexDescription, jobsIndexFaq, jobsIndexIntro, jobsIndexTitle, type JobsIndexFacts } from '@/lib/seo/jobs-index';

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  error: null as { message: string } | null,
  calls: [] as unknown[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: () => {
      const query = {
        select: (...args: unknown[]) => { db.calls.push(['select', ...args]); return query; },
        eq: (...args: unknown[]) => { db.calls.push(['eq', ...args]); return query; },
        not: (...args: unknown[]) => { db.calls.push(['not', ...args]); return query; },
        order: (...args: unknown[]) => { db.calls.push(['order', ...args]); return query; },
        range: (...args: unknown[]) => { db.calls.push(['range', ...args]); return query; },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
          data: db.error ? null : db.rows,
          error: db.error,
        })),
      };
      return query;
    },
  }),
}));
vi.mock('@/components/JobDetailPane', () => ({ default: () => null }));
vi.mock('@/components/JobSplitNavigation', () => ({ RestoreListFocus: () => null }));
vi.mock('@/components/JobResults', () => ({ default: () => null }));
vi.mock('@/components/JobFilters', () => ({ default: () => null }));
vi.mock('@/components/JobSearchBar', () => ({ default: () => null }));
vi.mock('@/components/JobIndustryShortcuts', () => ({ default: () => null }));

import JobsPage, { generateMetadata } from '@/app/jobs/page';

const rows = [
  { category: 'Food & Beverage', job_type: 'full_time', company_id: 'a' },
  { category: 'Food & Beverage', job_type: 'part_time', company_id: 'a' },
  { category: 'Tourism & Hospitality', job_type: 'full_time', company_id: 'b' },
  { category: 'Retail & Trade', job_type: 'full_time', company_id: 'c' },
  { category: 'Healthcare', job_type: 'full_time', company_id: 'd' },
  { category: 'Cleaning & Maintenance', job_type: 'full_time', company_id: 'd' },
  { category: 'Weird', job_type: 'full_time', company_id: 'e' },
  { category: 'Automotive', job_type: 'contract', company_id: null },
];

beforeEach(() => {
  cleanup();
  db.rows = rows;
  db.error = null;
  db.calls = [];
});

describe('jobs index copy', () => {
  const facts: JobsIndexFacts = {
    openJobs: 8,
    employersHiring: 5,
    partTimeJobs: 1,
    categories: [
      { name: 'Food & Beverage', count: 2 },
      { name: 'Cleaning & Maintenance', count: 1 },
      { name: 'Retail & Trade', count: 0 },
    ],
  };

  it('builds a live title and description without a hard-coded count', () => {
    const title = jobsIndexTitle(facts.openJobs);
    const description = jobsIndexDescription(facts.openJobs);
    expect(title).toBe('Jobs in Antigua and Barbuda: 8 Open Vacancies');
    expect(`${title} | JobLink`.length).toBeGreaterThanOrEqual(50);
    expect(`${title} | JobLink`.length).toBeLessThanOrEqual(70);
    expect(description).toBe('Browse 8 jobs in Antigua and Barbuda. Filter by industry, location, or job type and apply free on JobLink, the local job board. Employers can post free.');
    expect(description.length).toBeGreaterThanOrEqual(140);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(jobsIndexTitle(1)).toBe('Jobs in Antigua and Barbuda: 1 Open Vacancy');
    expect(jobsIndexDescription(1)).toContain('Browse 1 job in Antigua and Barbuda.');
    expect(jobsIndexTitle(null)).toBe('Jobs in Antigua and Barbuda');
    expect(jobsIndexDescription(null)).not.toMatch(/\d/);
  });

  it('drops empty categories and skips employer copy when nobody is hiring', () => {
    const intro = jobsIndexIntro({ ...facts, employersHiring: 0 }).join(' ');
    expect(intro).toContain('8 open jobs');
    expect(intro).toContain('Food & Beverage (2 open jobs)');
    expect(intro).toContain('Cleaning & Maintenance (1 open job)');
    expect(intro).not.toContain('Retail & Trade');
    expect(intro).not.toContain('employer');
    expect(jobsIndexIntro({ ...facts, employersHiring: 1 }).join(' ')).toContain('1 employer is hiring.');
    const kinds = faqPlainText(jobsIndexFaq(facts).find(item => item.question.startsWith('What kinds'))!);
    expect(kinds).not.toContain('Retail & Trade');
    expect(faqPlainText(jobsIndexFaq(facts).find(item => item.question.startsWith('Are there part-time'))!))
      .toBe('Listings can be filtered by Part Time. Right now, 1 of 8 open jobs is tagged Part Time.');
  });

  it('omits live numbers when the count cannot be read', () => {
    const faq = jobsIndexFaq(null).map(item => item.question);
    expect(faq).not.toContain('How many jobs are open in Antigua right now?');
    expect(faq).not.toContain('Are there part-time jobs in Antigua?');
    expect(jobsIndexIntro(null).join(' ')).not.toMatch(/\d/);
    const text = jobsIndexFaq(null).map(faqPlainText).join(' ');
    expect(text).not.toMatch(/work permit|paid verification|pricing|subscription/i);
    expect(text).toContain('browse and apply free');
    expect(text).toContain('post a job free');
  });
});

describe('jobs index page', () => {
  it('renders the keyword H1 and FAQ JSON-LD that matches the visible answers', async () => {
    render(await JobsPage({ searchParams: Promise.resolve({ job: 'selected-job' }) }));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Jobs in Antigua and Barbuda');
    expect(screen.getByText('JobLink lists 8 open jobs in Antigua and Barbuda right now. 5 employers are hiring.')).toBeDefined();
    expect(screen.getByText('The largest groups with open jobs are Food & Beverage (2 open jobs), Automotive (1 open job) and Cleaning & Maintenance (1 open job).')).toBeDefined();
    expect(document.body.textContent).not.toContain('Weird');
    expect(document.body.textContent).not.toMatch(/work permit|paid verification|pricing/i);

    const faq = jobsIndexFaq({
      openJobs: 8,
      employersHiring: 5,
      partTimeJobs: 1,
      categories: [
        { name: 'Food & Beverage', count: 2 },
        { name: 'Automotive', count: 1 },
        { name: 'Cleaning & Maintenance', count: 1 },
        { name: 'Healthcare', count: 1 },
        { name: 'Retail & Trade', count: 1 },
        { name: 'Tourism & Hospitality', count: 1 },
      ],
    });
    for (const item of faq) {
      const heading = screen.getByRole('heading', { level: 3, name: item.question });
      expect(heading.nextElementSibling?.textContent).toBe(faqPlainText(item));
    }

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const schema = JSON.parse(scripts[0].textContent || '');
    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity.map((entry: { name: string }) => entry.name)).toEqual(faq.map(item => item.question));
    expect(schema.mainEntity.map((entry: { acceptedAnswer: { text: string } }) => entry.acceptedAnswer.text)).toEqual(faq.map(faqPlainText));

    expect(screen.getByRole('link', { name: 'part-time jobs' }).getAttribute('href')).toBe('/jobs?job_type=part_time');
    expect(screen.getByRole('link', { name: 'hospitality jobs' }).getAttribute('href')).toBe('/jobs?category=Tourism%20%26%20Hospitality');
    expect(screen.getByRole('link', { name: 'restaurant jobs' }).getAttribute('href')).toBe('/jobs?category=Food%20%26%20Beverage');
    expect(screen.getByRole('link', { name: 'post a job free' }).getAttribute('href')).toBe('/employers');
    expect(screen.getByRole('link', { name: 'Hiring help' }).getAttribute('href')).toBe('/employers/hiring-help');
    expect(db.calls).toContainEqual(['eq', 'status', 'active']);
    expect(db.calls).toContainEqual(['not', 'id', 'in', closedJobIdFilter()]);
  });

  it('puts the live count in the index title and meta description', async () => {
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(metadata.title).toBe('Jobs in Antigua and Barbuda: 8 Open Vacancies');
    expect(metadata.description).toBe(jobsIndexDescription(8));
    expect(metadata.openGraph?.title).toBe('Jobs in Antigua and Barbuda: 8 Open Vacancies | JobLink');
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.alternates?.canonical).toBe('https://joblinkantigua.com/jobs');
  });

  it('leaves category pages and filtered results on their existing headings', async () => {
    render(await JobsPage({ searchParams: Promise.resolve({ category: 'Retail & Trade', job: 'selected-job' }) }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Retail & Trade Jobs');
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    cleanup();
    render(await JobsPage({ searchParams: Promise.resolve({ q: 'cashier', job: 'selected-job' }) }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Jobs in Antigua and Barbuda');
    expect(screen.getByText('Discover opportunities across Antigua and Barbuda')).toBeDefined();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
  });

  it('does not publish a zero when the count query fails', async () => {
    db.error = { message: 'unavailable' };
    render(await JobsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Jobs in Antigua and Barbuda');
    expect(document.body.textContent).not.toMatch(/\d+ open job/);
    expect(screen.queryByRole('heading', { name: 'How many jobs are open in Antigua right now?' })).toBeNull();
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) });
    expect(metadata.title).toBe('Jobs in Antigua and Barbuda');
    expect(metadata.description).not.toMatch(/\d/);
  });
});
