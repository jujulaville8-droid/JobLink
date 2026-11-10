/**
 * Confidential employers: an employer can ask not to be named. Their company
 * row is hidden by row security from everyone but its owner and admins, and
 * their listings carry is_confidential so pages can label them.
 *
 * Code that reads companies with the service-role client bypasses that row
 * security, so anything it shows or sends to a job seeker must go through
 * publicEmployerName().
 */

export const CONFIDENTIAL_EMPLOYER_NAME = "Confidential employer";

export const CONFIDENTIAL_EMPLOYER_BADGE = "Verified by JobLink";

export const CONFIDENTIAL_EMPLOYER_NOTE =
  "JobLink has verified this employer. They have asked not to be named on this listing and will share who they are with candidates they invite to interview.";

// Loose on purpose: nested Supabase rows often arrive as Record<string, unknown>.
type MaybeConfidential = {
  company_name?: unknown;
  is_confidential?: unknown;
} | null | undefined;

function nameOf(company: MaybeConfidential): string {
  return typeof company?.company_name === "string" ? company.company_name.trim() : "";
}

/** The employer name to show anyone other than the employer and JobLink admins. */
export function publicEmployerName(company: MaybeConfidential, fallback = "Employer"): string {
  if (company?.is_confidential === true) return CONFIDENTIAL_EMPLOYER_NAME;
  return nameOf(company) || fallback;
}

/**
 * Name for a listing read through row security: a confidential listing comes
 * back with no company at all, so the listing's own flag decides the label.
 */
export function listingEmployerName(
  listingIsConfidential: boolean | null | undefined,
  company: MaybeConfidential,
  fallback = "Employer",
): string {
  if (listingIsConfidential === true || company?.is_confidential === true) return CONFIDENTIAL_EMPLOYER_NAME;
  return nameOf(company) || fallback;
}
