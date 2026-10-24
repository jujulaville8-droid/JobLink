import { getEmployerApproval } from "@/lib/seo/employerApproved";
import { hasUnconfirmedEmploymentType } from "@/lib/seo/unconfirmed-employment-types";

export interface JobTypeSource {
  id: string;
  company_id?: string | null;
  posted_by_admin?: boolean | null;
  description?: string | null;
}

/** Same test the job page uses to decide whether a listing was imported by JobLink. */
export function isImportedJobListing(job: Pick<JobTypeSource, "posted_by_admin" | "description">): boolean {
  return !!job.posted_by_admin ||
    /imported by JobLink from a public job post/i.test(job.description || "");
}

/**
 * Whether the stored job type may be shown publicly. Mirrors the JobPosting
 * employmentType rule: never for vacancies flagged unconfirmed, and never for
 * imported listings with no employer approval entry (their stored type is an
 * import placeholder). Employer-posted jobs are the employer's own choice.
 */
export function isJobTypeConfirmed(job: JobTypeSource): boolean {
  const companyId = job.company_id ?? null;
  if (hasUnconfirmedEmploymentType(job.id, companyId)) return false;
  const approval = getEmployerApproval(companyId, job.id);
  if (approval && "employmentTypeUnconfirmed" in approval && approval.employmentTypeUnconfirmed) return false;
  if (!approval && isImportedJobListing(job)) return false;
  return true;
}

/** Stored job type, its approval override, or null when it must not be shown. */
export function publicJobType(job: JobTypeSource & { job_type: string | null }): string | null {
  if (!isJobTypeConfirmed(job)) return null;
  const approval = getEmployerApproval(job.company_id ?? null, job.id);
  return approval?.jobTypeOverrides?.[job.id] ?? job.job_type;
}
