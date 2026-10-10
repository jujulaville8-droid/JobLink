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
};

export function getPublicJobDeadline(jobId: string, companyId: string | null | undefined): string | undefined {
  if (!Object.hasOwn(PUBLIC_JOB_DEADLINES, jobId)) return undefined;
  const deadline = PUBLIC_JOB_DEADLINES[jobId];
  return deadline.companyId === companyId ? deadline.validThrough : undefined;
}
