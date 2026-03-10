import { createClient } from "@/lib/supabase/server";
import JobCard, { Job } from "@/components/JobCard";
import JobFilters from "@/components/JobFilters";
import { Suspense } from "react";
import { JOB_TYPE_LABELS, JobType } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    location?: string;
    category?: string;
    job_type?: string | string[];
    work_permit?: string;
  }>;
}

export const metadata = {
  title: "Browse Jobs | JobLink",
  description:
    "Find the latest job opportunities in Antigua and Barbuda. Filter by industry, location, job type, and more.",
};

async function JobResults({
  searchParams,
}: {
  searchParams: {
    q?: string;
    location?: string;
    category?: string;
    job_type?: string | string[];
    work_permit?: string;
  };
}) {
  const supabase = await createClient();

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
      company:companies (
        id,
        company_name,
        logo_url
      )
    `
    )
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  // Keyword search on title and description
  if (searchParams.q) {
    const keyword = `%${searchParams.q}%`;
    query = query.or(`title.ilike.${keyword},description.ilike.${keyword}`);
  }

  // Location filter
  if (searchParams.location) {
    query = query.eq("location", searchParams.location);
  }

  // Category filter
  if (searchParams.category) {
    query = query.eq("category", searchParams.category);
  }

  // Job type filter (can be multiple)
  if (searchParams.job_type) {
    const types = Array.isArray(searchParams.job_type)
      ? searchParams.job_type
      : [searchParams.job_type];
    if (types.length > 0) {
      query = query.in("job_type", types);
    }
  }

  // Work permit filter
  if (searchParams.work_permit === "true") {
    query = query.eq("requires_work_permit", true);
  }

  const { data: jobs, error } = await query;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">
          Something went wrong loading jobs.
        </p>
        <p className="text-sm text-red-500 mt-1">Please try again later.</p>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-10 text-center">
        <svg
          className="mx-auto h-12 w-12 text-text-light/50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-text">No jobs found</h3>
        <p className="mt-1 text-sm text-text-light">
          Try adjusting your filters or search terms to find more opportunities.
        </p>
      </div>
    );
  }

  // Map to the Job interface expected by JobCard
  const mappedJobs: Job[] = jobs.map((job) => {
    const company = job.company as unknown as {
      id: string;
      company_name: string;
      logo_url: string | null;
    } | null;

    const jobTypeLabel =
      JOB_TYPE_LABELS[job.job_type as JobType] || job.job_type;

    return {
      id: job.id,
      title: job.title,
      company_name: company?.company_name || "Company",
      company_logo: company?.logo_url || null,
      location: job.location,
      job_type: jobTypeLabel,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_visible: job.salary_visible,
      created_at: job.created_at,
      is_featured: job.is_featured,
    };
  });

  return (
    <div>
      <p className="mb-4 text-sm text-text-light">
        <span className="font-semibold text-text">{mappedJobs.length}</span>{" "}
        {mappedJobs.length === 1 ? "job" : "jobs"} found
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {mappedJobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

export default async function JobsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-text">
          Browse Jobs
        </h1>
        <p className="mt-1 text-sm text-text-light">
          Discover opportunities across Antigua and Barbuda
        </p>
      </div>

      {/* Search bar */}
      {params.q && (
        <div className="mb-4">
          <p className="text-sm text-text-light">
            Results for{" "}
            <span className="font-semibold text-text">
              &ldquo;{params.q}&rdquo;
            </span>
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Filters */}
        <Suspense fallback={null}>
          <JobFilters />
        </Suspense>

        {/* Results */}
        <div className="flex-1 min-w-0">
          <Suspense
            fallback={
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-xl border border-border bg-white p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-lg bg-gray-200" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 rounded bg-gray-200" />
                        <div className="h-3 w-1/2 rounded bg-gray-200" />
                        <div className="h-3 w-1/3 rounded bg-gray-200" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            }
          >
            <JobResults searchParams={params} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
