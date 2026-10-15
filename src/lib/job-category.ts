import { INDUSTRIES } from "@/lib/types";

/** Canonical taxonomy spelling shared by metadata, filters and job queries. */
export function knownJobCategory(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return INDUSTRIES.find((industry) => industry.toLowerCase() === normalized);
}

/** Unknown filters remain filters; never silently widen them to all jobs. */
export function jobCategoryFilter(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return knownJobCategory(value) ?? (value.trim() || undefined);
}
