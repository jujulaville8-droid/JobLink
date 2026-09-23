import { describe, expect, it } from 'vitest';
import { validateResumeEntry } from '@/lib/resume-sections';

describe('resume entry validation', () => {
  it('rejects empty required fields before any save', () => {
    expect(() => validateResumeEntry('experiences', { job_title: '  ', company_name: 'Hotel', start_date: '2022-06' })).toThrow(/Job title/);
  });
  it('normalizes months and current roles without carrying an old end date', () => {
    expect(validateResumeEntry('experiences', { job_title: ' Supervisor ', company_name: 'Hotel', start_date: '2022-06', end_date: '2024-01', is_current: true })).toMatchObject({ job_title: 'Supervisor', start_date: '2022-06-01', end_date: null, is_current: true });
  });
  it('rejects reversed dates and invalid months', () => {
    expect(() => validateResumeEntry('education', { institution: 'School', degree: 'Diploma', start_date: '2024-01', end_date: '2023-01' })).toThrow(/End date/);
    expect(() => validateResumeEntry('education', { institution: 'School', degree: 'Diploma', start_date: '2024-99' })).toThrow(/Start date/);
  });
  it('does not accept ownership fields supplied by a browser', () => {
    expect(validateResumeEntry('skills', { name: ' Service ', cv_profile_id: 'somebody-else', user_id: 'admin' })).toEqual({ name: 'Service' });
  });
  it('preserves blank optional dates as null, not Present', () => {
    expect(validateResumeEntry('volunteer', { organization: 'Community Pantry' })).toMatchObject({ start_date: null, end_date: null, is_current: false });
  });
});
