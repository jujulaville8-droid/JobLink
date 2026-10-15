import { expect, it } from 'vitest';
import { getPublicJobDeadline } from '@/lib/seo/public-job-deadlines';
import { EMPLOYER_APPROVED_JOBS, getEmployerApproval } from '@/lib/seo/employerApproved';

const facts = [
  ['e03a2b8c-f69b-42bb-bc43-13a5d0917291', '362300b7-c0c5-4c2e-a9f6-6fe79f187e71', '2026-10-03'],
  ['d4fdb396-a0b0-427d-aae0-ed756274375e', '42e58a5e-3f56-4f2b-b829-b9b335d45b81', '2026-10-30'],
  ['ade78a5c-e0f6-4f5f-8008-117d7a4b96ee', '1b68107a-228a-4e97-b047-d4c14bd730ef', '2026-10-30'],
  ['03aeffa0-f680-46b2-b5eb-ea3891d0ce44', '6b354ee5-ff32-44b3-a5c8-29f73650b51a', '2026-10-15'],
  ['7181a600-df8e-45dd-b8d1-a0e910c1f494', '8b95a031-0ce5-4e2d-9087-fda18d2ccc7c', '2026-10-18'],
];

it.each(facts)('retains original date-only facts scoped to vacancy and company: %s', (jobId, companyId, date) => {
  expect(getPublicJobDeadline(jobId, companyId)).toBe(date);
  expect(getPublicJobDeadline(jobId, 'another-company')).toBeUndefined();
  expect(getPublicJobDeadline('another-job', companyId)).toBeUndefined();
  expect(getPublicJobDeadline(jobId, null)).toBeUndefined();
});

it.each(facts.slice(1))('never treats a preserved deadline as employer approval: %s', (jobId, companyId) => {
  // These vacancies are approved only through their own EMPLOYER_APPROVED_JOBS
  // entries; the deadline record grants nothing on its own.
  expect(getEmployerApproval(companyId, jobId)).toMatchObject({ companyId });
  expect(getEmployerApproval(companyId, 'another-job')).toBeNull();
  const approval = EMPLOYER_APPROVED_JOBS[jobId];
  delete EMPLOYER_APPROVED_JOBS[jobId];
  try {
    expect(getPublicJobDeadline(jobId, companyId)).toBeDefined();
    expect(getEmployerApproval(companyId, jobId)).toBeNull();
  } finally {
    EMPLOYER_APPROVED_JOBS[jobId] = approval;
  }
});

it.each(['constructor', '__proto__', 'toString'])('ignores inherited record keys: %s', jobId => {
  expect(getPublicJobDeadline(jobId, 'company')).toBeUndefined();
});
