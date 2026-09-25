import type { JobType } from "@/lib/types";

/**
 * Employers who have explicitly allowed JobLink to list their jobs.
 *
 * Google for Jobs does not allow "job postings on behalf of an organization or
 * company without authorization", so a listing the JobLink team imported or
 * posted only gets JobPosting structured data once its employer has said yes.
 * Jobs employers post themselves don't need to be listed here.
 *
 * To add an employer after they approve:
 *   1. Open any of their jobs on joblinkantigua.com and follow "View company
 *      profile". The id is the last part of the URL: /companies/<company id>.
 *   2. Add an entry below, keyed by that company id, with the company name and
 *      the date they approved. Every current and future job from that company
 *      then qualifies.
 *   3. Only add jobTypeOverrides as a stopgap when a listing's stored job type
 *      is wrong. Fixing the job type in admin is the real fix; remove the
 *      override once that's done.
 */
export interface EmployerApproval {
  /** Human reference only; matching is by company id. */
  companyName: string;
  /** Date the employer gave permission (YYYY-MM-DD). */
  approvedOn: string;
  /** Temporary job type corrections, keyed by job id. */
  jobTypeOverrides?: Record<string, JobType>;
}

export const EMPLOYER_APPROVED_COMPANIES: Record<string, EmployerApproval> = {
  "362300b7-c0c5-4c2e-a9f6-6fe79f187e71": {
    companyName: "Top Bun Antigua",
    approvedOn: "2026-09-25",
    jobTypeOverrides: {
      // "Cook (Part time, Saturday only)" is stored as full_time.
      "e03a2b8c-f69b-42bb-bc43-13a5d0917291": "part_time",
    },
  },
};

export function getEmployerApproval(
  companyId: string | null | undefined
): EmployerApproval | null {
  if (!companyId) return null;
  return EMPLOYER_APPROVED_COMPANIES[companyId] ?? null;
}
