import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import JobCard, { type Job } from '@/components/JobCard';
import { displayJobLocation } from '@/lib/job-location';

const base: Job = {
  id: 'c38baf47-a23c-4908-b2ed-c80163d6b06d',
  title: 'Experienced Chef (Nights)',
  company_name: 'Trappas Restaurant and Bar',
  location: null,
  job_type: 'full_time',
  created_at: '2026-10-01T12:00:00Z',
};
const text = (job: Job) => new DOMParser().parseFromString(renderToString(<JobCard job={job} />), 'text/html').body.textContent ?? '';

describe('job card location', () => {
  it('falls back to the company address when the job has no location', () => {
    const shown = text({ ...base, company_location: 'English Harbour, Antigua' });
    expect(shown).toContain('English Harbour, Antigua');
    expect(shown).not.toContain('Location not provided');
  });
  it("prefers the job's own location", () => {
    expect(text({ ...base, location: "Crabb's Peninsula, Antigua", company_location: 'English Harbour, Antigua' }))
      .toContain("Crabb's Peninsula, Antigua");
  });
  it.each([null, '', '  ', 'Remote', 'Remote, Antigua'])('says so when no usable location is recorded (company %j)', company => {
    expect(text({ ...base, company_location: company })).toContain('Location not provided');
  });
  it('never takes remote from the company but keeps a remote job location', () => {
    expect(displayJobLocation(null, 'Remote')).toBe('');
    expect(displayJobLocation('Remote', 'English Harbour')).toBe('Remote');
    expect(displayJobLocation('  ', ' St. John\'s ')).toBe("St. John's");
  });
});
