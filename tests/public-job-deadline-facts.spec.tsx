import { expect, it } from 'vitest';
import { getPublicJobDeadline } from '@/lib/seo/public-job-deadlines';
import { getEmployerApproval } from '@/lib/seo/employerApproved';

const facts = [
  ['e03a2b8c-f69b-42bb-bc43-13a5d0917291', '362300b7-c0c5-4c2e-a9f6-6fe79f187e71', '2026-10-03'],
  ['d4fdb396-a0b0-427d-aae0-ed756274375e', '42e58a5e-3f56-4f2b-b829-b9b335d45b81', '2026-10-30'],
  ['ade78a5c-e0f6-4f5f-8008-117d7a4b96ee', '1b68107a-228a-4e97-b047-d4c14bd730ef', '2026-10-30'],
];

it.each(facts)('retains original date-only facts scoped to vacancy and company: %s', (jobId, companyId, date) => {
  expect(getPublicJobDeadline(jobId, companyId)).toBe(date);
  expect(getPublicJobDeadline(jobId, 'another-company')).toBeUndefined();
  expect(getPublicJobDeadline('another-job', companyId)).toBeUndefined();
  expect(getPublicJobDeadline(jobId, null)).toBeUndefined();
});

it.each(facts.slice(1))('never treats a preserved deadline as employer approval: %s', (jobId, companyId) => {
  expect(getEmployerApproval(companyId, jobId)).toBeNull();
});

it.each(['constructor', '__proto__', 'toString'])('ignores inherited record keys: %s', jobId => {
  expect(getPublicJobDeadline(jobId, 'company')).toBeUndefined();
});
