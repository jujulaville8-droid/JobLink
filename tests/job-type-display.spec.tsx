import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isJobTypeConfirmed, publicJobType } from '@/lib/seo/job-type-display';
import { NumberTicker } from '@/components/magicui/number-ticker';

describe('public job type', () => {
  it('hides the type for approved vacancies flagged unconfirmed', () => {
    const job = { id: 'd00f5ff5-29cf-4110-9828-a2f84e49245f', company_id: '5d2c7dd8-7ff7-4dea-a3c7-22f81cf04eb3', posted_by_admin: true, job_type: 'full_time' };
    expect(isJobTypeConfirmed(job)).toBe(false);
    expect(publicJobType(job)).toBeNull();
  });
  it('shows the type for approved vacancies with a confirmed type', () => {
    const job = { id: 'e81d3a56-c9fe-42dd-99ab-a35398398582', company_id: 'd3c66ca7-9066-4f4a-a87c-a307b9d63ab5', posted_by_admin: true, job_type: 'full_time' };
    expect(publicJobType(job)).toBe('full_time');
  });
  it('hides the type for imported listings with no approval entry', () => {
    expect(publicJobType({ id: 'x', company_id: 'y', posted_by_admin: true, job_type: 'full_time' })).toBeNull();
    expect(publicJobType({ id: 'x', company_id: 'y', description: 'Imported by JobLink from a public job post.', job_type: 'full_time' })).toBeNull();
  });
  it('shows the type for employer-posted jobs', () => {
    expect(publicJobType({ id: 'x', company_id: 'y', posted_by_admin: false, job_type: 'part_time' })).toBe('part_time');
  });
});

describe('NumberTicker server HTML', () => {
  it('renders the real value, not the start value', () => {
    const html = renderToStaticMarkup(<NumberTicker value={1234} />);
    expect(html).toContain('>1,234<');
  });
});
