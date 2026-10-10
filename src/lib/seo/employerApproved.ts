import type { JobType } from "@/lib/types";

/**
 * Employers who have explicitly allowed JobLink to list their jobs.
 *
 * Google for Jobs does not allow "job postings on behalf of an organization or
 * company without authorization", so a listing the JobLink team imported or
 * posted only gets JobPosting structured data once its employer has said yes.
 * Jobs employers post themselves don't need to be listed here.
 *
 * To record a verified approval:
 *   1. Confirm its scope from the employer or the site owner's attestation. A yes to one
 *      vacancy belongs in EMPLOYER_APPROVED_JOBS, never the company-wide map.
 *   2. Use that job's id and the company id from its "View company profile"
 *      link. Record the attestation date and a traceable evidence reference
 *      (not private email content). See docs/jobposting-approvals.md.
 *   3. Company-wide entries require explicit permission covering current and
 *      future jobs. Claiming a company account does not expand approval scope.
 *   4. Only add jobTypeOverrides as a stopgap when a listing's stored job type
 *      is wrong. Fixing the job type in admin is the real fix; remove the
 *      override once that's done.
 */
export interface EmployerApproval {
  /** Human reference only; matching is by company id. */
  companyName: string;
  /** Approval date supplied by the employer or owner attestation (YYYY-MM-DD). */
  approvedOn: string;
  /** Temporary job type corrections, keyed by job id. */
  jobTypeOverrides?: Record<string, JobType>;
}

export interface JobApproval extends Omit<EmployerApproval, "approvedOn"> {
  /** Bind permission to the original company as well as the vacancy id. */
  companyId: string;
  /** Date authorization was attested, not an inferred historical reply date. */
  attestedOn: string;
  /** Reference to the employer confirmation or owner attestation. */
  evidenceReference: string;
  /** Date-only deadline stated in the visible listing, if expires_at is absent. */
  validThrough?: string;
  /** Omit optional employmentType markup until the employer confirms it. */
  employmentTypeUnconfirmed?: boolean;
}

// The original September 30 owner attestation covered only these vacancies;
// see docs/jobposting-approvals.md for provenance and later company-wide scope.
export const EMPLOYER_APPROVED_JOBS: Record<string, JobApproval> = {
  "232f9e93-d28c-4e8b-bdb5-3c85093e61d6": {
    companyId: "e9703c50-bfef-41fb-99f1-5ba9387418c2",
    companyName: "Star Times Adventure Tours",
    attestedOn: "2026-10-06",
    evidenceReference: "https://github.com/jujulaville8-droid/JobLink/pull/25",
    // The approval record documents full_time as an unconfirmed placeholder.
    employmentTypeUnconfirmed: true,
  },
  "318d3b16-6aff-453c-b0d3-fc5f2d779783": {
    companyId: "1b11e815-e80b-4b35-affe-55c1d1fc16db",
    companyName: "MOfit Gym and Fitness Centre",
    attestedOn: "2026-09-30",
    evidenceReference: "owner-attestation:2026-09-30:Sentinel_cace3b51c42c81919512b87c905bc49a",
  },
  "bb1b011d-4e5c-4005-81b6-bc70c48acf4f": {
    companyId: "6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961",
    companyName: "Woodstock BoatBuilders",
    attestedOn: "2026-09-30",
    evidenceReference: "owner-attestation:2026-09-30:Sentinel_cace3b51c42c81919512b87c905bc49a",
    // Public description: "Apply before: 29 October 2026". No time was supplied.
    validThrough: "2026-10-29",
  },
};

// Company-wide permission is recorded from the site owner's explicit attestation.
// Existing vacancy metadata and Top Bun's type correction are retained.
export const EMPLOYER_APPROVED_COMPANIES: Record<string, EmployerApproval> = {
  "362300b7-c0c5-4c2e-a9f6-6fe79f187e71": {
    companyName: "Top Bun Antigua",
    approvedOn: "2026-09-25",
    jobTypeOverrides: {
      // "Cook (Part time, Saturday only)" is stored as full_time.
      "e03a2b8c-f69b-42bb-bc43-13a5d0917291": "part_time",
    },
  },
  "1b11e815-e80b-4b35-affe-55c1d1fc16db": {
    companyName: "MOfit Gym and Fitness Centre",
    approvedOn: "2026-09-30",
  },
  "6dde0e9d-e04a-4d95-a9d3-50fa9ffcc961": {
    companyName: "Woodstock BoatBuilders",
    approvedOn: "2026-09-30",
  },
  // Owner-attested company-wide approval on 2026-10-05; see the approval ledger.
  "9fde7fc7-70b3-4354-9d11-d520f4ec09f9": {
    companyName: "Nobu Barbuda",
    approvedOn: "2026-10-05",
  },
};

export function getEmployerApproval(
  companyId: string | null | undefined,
  jobId?: string | null
): EmployerApproval | JobApproval | null {
  if (!companyId) return null;

  if (jobId && Object.hasOwn(EMPLOYER_APPROVED_JOBS, jobId)) {
    const approval = EMPLOYER_APPROVED_JOBS[jobId];
    if (approval.companyId === companyId) return approval;
  }

  return Object.hasOwn(EMPLOYER_APPROVED_COMPANIES, companyId)
    ? EMPLOYER_APPROVED_COMPANIES[companyId]
    : null;
}
