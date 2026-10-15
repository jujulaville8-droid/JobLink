interface PublicJobDeadline {
  companyId: string;
  validThrough: string;
}

// Original published listing facts, retained even when deadline text is hidden.
// These are not authorization or database expiry instructions.
// A date-only application deadline stays date-only; no cutoff time is invented.
const PUBLIC_JOB_DEADLINES: Record<string, PublicJobDeadline> = {
  // https://joblinkantigua.com/jobs/e03a2b8c-f69b-42bb-bc43-13a5d0917291
  // Original description: "Application deadline: October 3, 2026."
  "e03a2b8c-f69b-42bb-bc43-13a5d0917291": {
    companyId: "362300b7-c0c5-4c2e-a9f6-6fe79f187e71",
    validThrough: "2026-10-03",
  },
  // https://joblinkantigua.com/jobs/d4fdb396-a0b0-427d-aae0-ed756274375e
  // Original description: "Applications close October 30, 2026."
  "d4fdb396-a0b0-427d-aae0-ed756274375e": {
    companyId: "42e58a5e-3f56-4f2b-b829-b9b335d45b81",
    validThrough: "2026-10-30",
  },
  // https://joblinkantigua.com/jobs/ade78a5c-e0f6-4f5f-8008-117d7a4b96ee
  // Original description: "Application deadline: 30 October 2026."
  "ade78a5c-e0f6-4f5f-8008-117d7a4b96ee": {
    companyId: "1b68107a-228a-4e97-b047-d4c14bd730ef",
    validThrough: "2026-10-30",
  },
  // https://joblinkantigua.com/jobs/03aeffa0-f680-46b2-b5eb-ea3891d0ce44
  // Original Dadli Jobs posting (https://dadlijobs.com/job/barista-prep-assistants-2/):
  // "Deadline: October 15, 2026."
  "03aeffa0-f680-46b2-b5eb-ea3891d0ce44": {
    companyId: "6b354ee5-ff32-44b3-a5c8-29f73650b51a",
    validThrough: "2026-10-15",
  },
  // https://joblinkantigua.com/jobs/7181a600-df8e-45dd-b8d1-a0e910c1f494
  // Original public posting (Youth On The Move Facebook group,
  // https://facebook.com/groups/144927202218946/permalink/29146341108317503/):
  // deadline October 18, 2026.
  "7181a600-df8e-45dd-b8d1-a0e910c1f494": {
    companyId: "8b95a031-0ce5-4e2d-9087-fda18d2ccc7c",
    validThrough: "2026-10-18",
  },
};

export function getPublicJobDeadline(jobId: string, companyId: string | null | undefined): string | undefined {
  if (!Object.hasOwn(PUBLIC_JOB_DEADLINES, jobId)) return undefined;
  const deadline = PUBLIC_JOB_DEADLINES[jobId];
  return deadline.companyId === companyId ? deadline.validThrough : undefined;
}
