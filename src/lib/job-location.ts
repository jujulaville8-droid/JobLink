/** Whitespace cleanup only. Never infer a work location from company HQ or prose. */
export function normalizeJobLocation(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') || '';
}

/** The job's own location, else the company address unless it only says "remote". */
export function displayJobLocation(jobLocation: string | null | undefined, companyLocation: string | null | undefined): string {
  const company = normalizeJobLocation(companyLocation);
  return normalizeJobLocation(jobLocation) || (/remote/i.test(company) ? '' : company);
}

/** Escape literal LIKE characters rather than deleting them and widening search. */
export function jobLocationPattern(value: string): string | null {
  const location = normalizeJobLocation(value);
  return location ? `%${location.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
}
