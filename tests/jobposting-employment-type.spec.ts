import { describe, expect, it } from 'vitest';
import { jobPostingEmploymentType } from '@/lib/seo/jobposting-employment-type';

describe('jobPostingEmploymentType', () => {
  it.each([
    ['full_time', 'FULL_TIME'],
    ['part_time', 'PART_TIME'],
    ['contract', 'CONTRACTOR'],
    ['temporary', 'TEMPORARY'],
    ['seasonal', 'TEMPORARY'],
    ['internship', 'INTERN'],
    ['volunteer', 'VOLUNTEER'],
    ['  full_time  ', 'FULL_TIME'],
  ] as const)('maps stored %j to %s', (stored, schemaType) => {
    expect(jobPostingEmploymentType(stored)).toBe(schemaType);
  });

  it.each([null, undefined, '', '   ', 'unknown', 'FULL_TIME'])('omits an unset or unrecognized type: %j', (stored) => {
    expect(jobPostingEmploymentType(stored)).toBeUndefined();
  });
});
