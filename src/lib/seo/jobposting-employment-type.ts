/**
 * schema.org JobPosting.employmentType from the stored job_type.
 *
 * The job page already shows this value (Full Time, Part Time, and so on).
 * Google's employmentType uses the same stored value. An older approval note
 * that the description did not restate the type does not omit it, and no
 * type is invented when job_type is missing or unrecognized.
 *
 * seasonal is a stored job_type with no schema.org value of its own, so it
 * stays TEMPORARY, which is the mapping this page already used.
 */
const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  seasonal: "TEMPORARY",
  internship: "INTERN",
  volunteer: "VOLUNTEER",
};

export function jobPostingEmploymentType(jobType: string | null | undefined): string | undefined {
  const key = jobType?.trim();
  if (!key) return undefined;
  return EMPLOYMENT_TYPE[key];
}
