/**
 * Employer consent for widened JobPosting structured data.
 *
 * The base JobPosting markup on a job page (title, description, datePosted,
 * employmentType, baseSalary when the salary is visible, jobLocation,
 * validThrough, hiringOrganization name/logo/website) is emitted for any
 * listing the employer posted themselves, exactly as it always has been.
 *
 * The fields in this module are the WIDENED set. They are emitted only with
 * permission recorded for the listing: either the employer who posted the
 * listing ticked the structured data consent checkbox on the post-job form
 * (agreeing to JobLink also publishing the posting's benefits and the
 * company profile description in the structured data), which stores
 * job_listings.structured_data_consent = true (with the consent time in
 * structured_data_consent_at), or the listing carries a recorded employer
 * approval (see canEmitWidenedFields).
 *
 * Imported listings never carry form consent: consent only exists through
 * the employer posting form, which imported listings never pass through.
 * For an imported listing, a recorded employer approval in
 * lib/seo/employerApproved.ts stands in for form consent for the widened
 * fields (see canEmitWidenedFields).
 *
 * Nothing here invents values. A widened field is emitted only when the
 * underlying data is actually present on the listing or company record.
 * Both widened values pass through the same email redaction as the
 * JobPosting description (lib/seo/jobposting-description.ts): employer
 * email addresses never appear in markup Google reads.
 */

import { redactJobPostingEmails } from "./jobposting-description";

/** The listing fields this module reads. Matches the job_listings row. */
export interface StructuredDataConsentListing {
  posted_by_admin?: boolean | null;
  description?: string | null;
  benefits?: unknown;
  structured_data_consent?: boolean | null;
}

/** A listing JobLink created or imported from a public post, not employer posted. */
export function isImportedJobListing(
  job: Pick<StructuredDataConsentListing, "posted_by_admin" | "description">,
): boolean {
  return (
    !!job.posted_by_admin ||
    /imported by JobLink from a public job post/i.test(job.description || "")
  );
}

/**
 * True only for an employer posted listing whose employer recorded consent
 * for widened structured data. Imported listings always return false.
 */
export function hasStructuredDataConsent(
  job: StructuredDataConsentListing,
): boolean {
  return job.structured_data_consent === true && !isImportedJobListing(job);
}

/**
 * Whether the widened fields may be emitted for a listing at all.
 *
 * Employer posted listings need the employer's own recorded form consent
 * (hasStructuredDataConsent). Admin posted (imported) listings can never
 * carry form consent, so for them a recorded employer approval stands in
 * for it: the same registry record, resolved by the caller through
 * getEmployerApproval in lib/seo/employerApproved.ts, that already gates
 * the listing's base JobPosting markup. getEmployerApproval only returns a
 * record bound to this listing's company (and, for per vacancy approvals,
 * to this listing's id), so an approval recorded for a different vacancy
 * or company never widens this listing. This stand-in follows the site
 * owner's direction of Nov 7, 2026 to treat recorded employer permission
 * as the basis for full markup.
 *
 * `employerApproval` is the caller's getEmployerApproval result; any
 * non-null value counts as a recorded approval.
 */
export function canEmitWidenedFields(
  job: StructuredDataConsentListing,
  employerApproval: unknown,
): boolean {
  if (hasStructuredDataConsent(job)) return true;
  return isImportedJobListing(job) && employerApproval != null;
}

/** The listing's benefits as clean display strings, in recorded order. */
export function jobBenefitsList(
  job: Pick<StructuredDataConsentListing, "benefits">,
): string[] {
  if (!Array.isArray(job.benefits)) return [];
  return job.benefits
    .filter((benefit): benefit is string => typeof benefit === "string")
    .map((benefit) => benefit.trim())
    .filter(Boolean);
}

export interface WidenedJobPostingFields {
  /** schema.org JobPosting.jobBenefits, from the listing's own benefits list. */
  jobBenefits?: string;
  /** Hiring organization description, from the company's own profile text. */
  hiringOrganizationDescription?: string;
}

/**
 * The widened JobPosting fields for a listing, built only from data actually
 * present. Returns an empty object when nothing widen-able is recorded, so
 * the caller can spread the result unconditionally once consent is confirmed.
 */
export function widenedJobPostingFields(
  job: Pick<StructuredDataConsentListing, "benefits">,
  company: { description?: string | null } | null | undefined,
): WidenedJobPostingFields {
  const fields: WidenedJobPostingFields = {};

  const benefits = jobBenefitsList(job);
  if (benefits.length) fields.jobBenefits = redactJobPostingEmails(benefits.join(", "));

  const companyDescription = company?.description?.trim();
  if (companyDescription) {
    fields.hiringOrganizationDescription = redactJobPostingEmails(companyDescription);
  }

  return fields;
}
