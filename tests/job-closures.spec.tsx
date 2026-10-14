import { expect, it } from 'vitest';
import { closedJobIdFilter, closedJobIds, getJobClosure } from '@/lib/job-closures';

const TOP_BUN = 'e03a2b8c-f69b-42bb-bc43-13a5d0917291';
const TOP_BUN_CO = '362300b7-c0c5-4c2e-a9f6-6fe79f187e71';
const STREET = '03aeffa0-f680-46b2-b5eb-ea3891d0ce44';
const STREET_CO = '6b354ee5-ff32-44b3-a5c8-29f73650b51a';
const SEAGULL = '7181a600-df8e-45dd-b8d1-a0e910c1f494';
const SEAGULL_CO = '8b95a031-0ce5-4e2d-9087-fda18d2ccc7c';

it('closes Top Bun now, bound to its company', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  expect(getJobClosure(TOP_BUN, TOP_BUN_CO, now)).toBeDefined();
  expect(getJobClosure(TOP_BUN, 'other', now)).toBeUndefined();
});

it('keeps Street Blends open through October 15 in Antigua, closed after', () => {
  expect(getJobClosure(STREET, STREET_CO, new Date('2026-10-16T03:59:00Z'))).toBeUndefined();
  expect(getJobClosure(STREET, STREET_CO, new Date('2026-10-16T04:00:00Z'))).toBeDefined();
});

it('keeps Seagull Inflatables open through October 18 in Antigua, closed after, bound to its company', () => {
  expect(getJobClosure(SEAGULL, SEAGULL_CO, new Date('2026-10-19T03:59:00Z'))).toBeUndefined();
  expect(getJobClosure(SEAGULL, SEAGULL_CO, new Date('2026-10-19T04:00:00Z'))).toBeDefined();
  expect(getJobClosure(SEAGULL, STREET_CO, new Date('2026-10-20T12:00:00Z'))).toBeUndefined();
});

it('builds a valid PostgREST id list', () => {
  expect(closedJobIds(new Date('2026-10-14T12:00:00Z'))).toEqual([TOP_BUN]);
  expect(closedJobIdFilter(new Date('2026-10-01T12:00:00Z'))).toBe('(00000000-0000-0000-0000-000000000000)');
  expect(closedJobIdFilter(new Date('2026-10-20T12:00:00Z'))).toBe(`(${TOP_BUN},${STREET},${SEAGULL})`);
  expect(closedJobIds(new Date('2026-10-17T12:00:00Z'))).toEqual([TOP_BUN, STREET]);
});
