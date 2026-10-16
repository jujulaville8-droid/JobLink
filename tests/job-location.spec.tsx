import { describe, expect, it } from 'vitest';
import { normalizeJobLocation, jobLocationPattern } from '@/lib/job-location';
import { onboardingReturnTo } from '@/lib/claim-links';

describe('recorded job locations', () => {
  it.each([null, undefined, '', ' \n\t '])('keeps missing location unknown: %j', value => {
    expect(normalizeJobLocation(value)).toBe('');
  });
  it('normalizes whitespace without changing spelling or claiming aliases/HQ', () => {
    expect(normalizeJobLocation('  English\u00a0 Harbour,  Antigua ')).toBe('English Harbour, Antigua');
    expect(normalizeJobLocation('St. Johns')).toBe('St. Johns');
    expect(jobLocationPattern('  English   Harbour ')).toBe('%English Harbour%');
    expect(jobLocationPattern(' \t ')).toBeNull();
  });
  it('escapes literal LIKE wildcards rather than silently widening the query', () => {
    expect(jobLocationPattern('100%_\\area')).toBe('%100\\%\\_\\\\area%');
  });
});
describe('onboarding destination scope', () => {
  it('preserves complete search context and exact application destinations', () => {
    for (const value of ['/jobs?q=chef&location=English+Harbour&job_type=full_time&job_type=part_time', '/jobs/123e4567-e89b-42d3-a456-426614174000/apply']) {
      expect(onboardingReturnTo(value)).toBe(value);
    }
  });
  it.each(['https://evil.example', '//evil.example', '/%252fevil.example', '/%255cevil.example', '/%0aevil.example', '/jobs/not-a-uuid/apply', '/jobs/123e4567-e89b-42d3-a456-426614174000/apply?next=//evil.example', '/dashboard', '/jobs-extra'])('rejects unexpected destination %s', value => {
    expect(onboardingReturnTo(value)).toBeNull();
  });
});
