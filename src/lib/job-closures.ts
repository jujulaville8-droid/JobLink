// Vacancies that are no longer available even though their stored status may
// still be "active". This is a code-level record because closing a listing in
// the database requires an admin action in production; once the stored status
// is set to "closed" the entry here can be removed.
//
// `closedAfter` is a date-only value. The listing closes once that calendar
// date has passed in Antigua (America/Antigua), so the named day stays open.
// Each entry is bound to both the job and company IDs.
interface JobClosure {
  companyId: string;
  closedAfter: string;
  reason: string;
}

const JOB_CLOSURES: Record<string, JobClosure> = {
  // Top Bun Antigua — Cook. Application deadline October 3, 2026 has passed;
  // closed on request on 2026-10-14.
  "e03a2b8c-f69b-42bb-bc43-13a5d0917291": {
    companyId: "362300b7-c0c5-4c2e-a9f6-6fe79f187e71",
    closedAfter: "2026-10-03",
    reason: "Applications for this vacancy have closed.",
  },
  // Street Blends — Barista Prep Assistants. Deadline: October 15, 2026.
  "03aeffa0-f680-46b2-b5eb-ea3891d0ce44": {
    companyId: "6b354ee5-ff32-44b3-a5c8-29f73650b51a",
    closedAfter: "2026-10-15",
    reason: "Applications for this vacancy closed on October 15, 2026.",
  },
  // Seagull Inflatables — Operations & Admin Coordinator. Deadline: October 18, 2026.
  "7181a600-df8e-45dd-b8d1-a0e910c1f494": {
    companyId: "8b95a031-0ce5-4e2d-9087-fda18d2ccc7c",
    closedAfter: "2026-10-18",
    reason: "Applications for this vacancy closed on October 18, 2026.",
  },
};

function antiguaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Antigua", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function getJobClosure(
  jobId: string,
  companyId: string | null | undefined,
  now: Date = new Date(),
): JobClosure | undefined {
  if (!Object.hasOwn(JOB_CLOSURES, jobId)) return undefined;
  const closure = JOB_CLOSURES[jobId];
  if (closure.companyId !== companyId) return undefined;
  return antiguaDate(now) > closure.closedAfter ? closure : undefined;
}

export function closedJobIds(now: Date = new Date()): string[] {
  return Object.entries(JOB_CLOSURES)
    .filter(([id, closure]) => getJobClosure(id, closure.companyId, now))
    .map(([id]) => id);
}

// PostgREST list for `.not("id", "in", value)`. A nil UUID keeps the list
// valid when nothing is closed.
export function closedJobIdFilter(now: Date = new Date()): string {
  const ids = closedJobIds(now);
  return `(${(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).join(",")})`;
}
