import { describe, expect, it } from 'vitest';
import { getApplicationReturnTo, getSafeReturnTo } from '@/lib/return-to';

const applicationPath = '/jobs/123e4567-e89b-42d3-a456-426614174000/apply';

describe('internal return destinations', () => {
  it.each([
    applicationPath,
    '/members',
    '/placement-feedback/123e4567-e89b-42d3-a456-426614174000',
    '/employers/upgrade',
    '/jobs?search=guest%20services#openings',
  ])('preserves legitimate destination %s', (path) => {
    expect(getSafeReturnTo(path)).toBe(path);
  });

  it.each([
    null, undefined, '', 'https://evil.example', 'javascript:alert(1)',
    '//evil.example', '///evil.example', '/\\evil.example', '\\evil.example',
    '/jobs\\apply', '/%5cevil.example', '/%2fevil.example', '/%252fevil.example',
    '/%255cevil.example', '/\n/evil.example', '/%0a/evil.example', '/%00/jobs',
    '/x/..//evil.example', '/%2e%2e//evil.example', '/%E0%A4%A', ' /jobs',
  ])('rejects unsafe destination %j', (path) => {
    expect(getSafeReturnTo(path)).toBeNull();
  });

  it('restricts the profile return journey to an exact application route', () => {
    expect(getApplicationReturnTo(applicationPath)).toBe(applicationPath);
    for (const path of ['/members', '/profile', '/jobs/not-a-job/apply', '/jobs/123/apply', `${applicationPath}/extra`, `${applicationPath}?returnTo=//evil.example`]) {
      expect(getApplicationReturnTo(path)).toBeNull();
    }
  });
});
