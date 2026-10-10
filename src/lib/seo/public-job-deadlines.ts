interface PublicJobDeadline {
  companyId: string;
  validThrough: string;
}

// Public listing facts, not authorization or database expiry instructions.
// A date-only application deadline stays date-only; no cutoff time is invented.
const PUBLIC_JOB_DEADLINES: Record<string, PublicJobDeadline> = {
  // https://joblinkantigua.com/jobs/e03a2b8c-f69b-42bb-bc43-13a5d0917291
  // Visible description: "Application deadline: October 3, 2026."
  "e03a2b8c-f69b-42bb-bc43-13a5d0917291": {
    companyId: "362300b7-c0c5-4c2e-a9f6-6fe79f187e71",
    validThrough: "2026-10-03",
  },
};

export function getPublicJobDeadline(jobId: string, companyId: string | null | undefined): string | undefined {
  if (!Object.hasOwn(PUBLIC_JOB_DEADLINES, jobId)) return undefined;
  const deadline = PUBLIC_JOB_DEADLINES[jobId];
  return deadline.companyId === companyId ? deadline.validThrough : undefined;
}
