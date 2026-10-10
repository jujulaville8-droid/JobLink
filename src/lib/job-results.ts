import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { jobCategoryFilter } from "@/lib/job-category";
import { ilikePattern } from "@/lib/safe-sql";

export const JOBS_PER_PAGE = 12;

export interface JobSearchParams {
  q?: string;
  location?: string;
  category?: string;
  job_type?: string | string[];
  page?: string | string[];
}

/** Reject ambiguous inputs instead of silently treating e.g. page=2oops as page 2. */
export function parseJobPage(value: JobSearchParams["page"]): number | null {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  // Both endpoints sent to PostgREST must stay exact, finite integers.
  return Number.isSafeInteger(page * JOBS_PER_PAGE) ? page : null;
}

// Primitive cache keys share the exact filtered result between metadata and the
// page during one render only. Do not persist user-scoped Supabase clients/data.
const loadJobResults = cache(async (
  q: string | undefined,
  location: string | undefined,
  category: string | undefined,
  jobTypes: string,
  currentPage: number,
) => {
  const searchParams = { q, location, category, job_type: JSON.parse(jobTypes) as JobSearchParams["job_type"] };
  const supabase = await createClient();
  const from = (currentPage - 1) * JOBS_PER_PAGE;
  const to = from + JOBS_PER_PAGE - 1;

  let query = supabase
    .from("job_listings")
    .select(
      `
      id,
      title,
      description,
      category,
      job_type,
      salary_min,
      salary_max,
      salary_visible,
      location,
      requires_work_permit,
      status,
      is_featured,
      expires_at,
      created_at,
      company_search:companies(),
      company:companies (
        id,
        company_name,
        logo_url,
        is_pro
      )
    `,
      { count: "exact" }
    )
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (searchParams.q) {
    // Quoted + wildcard-escaped: a raw value here breaks the or() expression
    // apart, so any search containing a comma used to 400.
    const keyword = ilikePattern(searchParams.q);
    query = query
      .ilike("company_search.company_name", `%${searchParams.q.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`)
      .or(`title.ilike.${keyword},description.ilike.${keyword},company_search.not.is.null`);
  }

  if (searchParams.location) {
    query = query.ilike("location", `%${searchParams.location.replace(/[\\%_]/g, "")}%`);
  }

  if (searchParams.category) {
    query = query.eq("category", searchParams.category);
  }

  if (searchParams.job_type) {
    const types = Array.isArray(searchParams.job_type)
      ? searchParams.job_type
      : [searchParams.job_type];
    if (types.length > 0) {
      query = query.in("job_type", types);
    }
  }

  const { data: jobs, error, count } = await query;
  return { supabase, jobs, error, count, currentPage };
});

export function getJobResults(searchParams: JobSearchParams, currentPage: number) {
  return loadJobResults(
    searchParams.q,
    searchParams.location,
    jobCategoryFilter(searchParams.category),
    JSON.stringify(searchParams.job_type ?? null),
    currentPage,
  );
}

export type JobResultsData = Awaited<ReturnType<typeof getJobResults>>;

/** Only a confirmed missing page is a 404; an unavailable backend is not one. */
export function isJobPageOutOfRange(result: JobResultsData): boolean {
  if (result.currentPage <= 1) return false;
  if (result.error) return result.error.code === "PGRST103";
  return result.jobs?.length === 0 || (
    result.count !== null && (result.currentPage - 1) * JOBS_PER_PAGE >= result.count
  );
}
