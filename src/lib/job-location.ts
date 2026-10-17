/** Whitespace cleanup only. Never infer a work location from company HQ or prose. */
export function normalizeJobLocation(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') || '';
}

/** Escape literal LIKE characters rather than deleting them and widening search. */
export function jobLocationPattern(value: string): string | null {
  const location = normalizeJobLocation(value);
  return location ? `%${location.replace(/[\\%_]/g, char => `\\${char}`)}%` : null;
}
