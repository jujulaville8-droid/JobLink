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

/**
 * The public stand-in company. Every confidential listing shows this company's
 * uploaded logo, including listings still attached to a real employer.
 */
export const CONFIDENTIAL_EMPLOYER_COMPANY_ID = "72f7a8ad-9850-45db-aa34-71e853d833a8";

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

type LogoCompany = {
  id?: unknown;
  logo_url?: unknown;
  is_confidential?: unknown;
} | null | undefined;

/**
 * Logo for a public listing. A confidential listing uses only the Confidential
 * Employer logo passed in, never the attached company's logo. Null means the
 * caller should show /logo-icon.png.
 */
export function publicListingLogo(
  listingIsConfidential: boolean | null | undefined,
  company: LogoCompany,
  confidentialLogo?: string | null,
): string | null {
  const confidential = listingIsConfidential === true || company?.is_confidential === true;
  const raw = confidential ? confidentialLogo : company?.logo_url;
  const logo = typeof raw === "string" ? raw.trim() : "";
  return logo || null;
}
