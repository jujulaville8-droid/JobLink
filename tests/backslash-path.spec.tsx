import { expect, it } from 'vitest';
import { stripBackslashes } from '@/lib/backslash-path';

it('leaves normal paths alone', () => {
  expect(stripBackslashes('/jobs')).toBeNull();
  expect(stripBackslashes('/jobs/03aeffa0-f680-46b2-b5eb-ea3891d0ce44')).toBeNull();
  expect(stripBackslashes('/')).toBeNull();
});

it.each([
  ['/jobs%5C', '/jobs'],
  ['/jobs%5C%5C%5C', '/jobs'],
  ['/jobs%5c', '/jobs'],
  ['/employers/hiring-help%5C', '/employers/hiring-help'],
  ['/jobs\\', '/jobs'],
  ['/jobs/%5C/abc', '/jobs/abc'],
  ['/%5C', '/'],
])('cleans %s to %s', (input, expected) => {
  expect(stripBackslashes(input)).toBe(expected);
});
