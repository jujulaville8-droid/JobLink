import JobResults from "@/components/JobResults";
import JobFilters from "@/components/JobFilters";
import JobSearchBar from "@/components/JobSearchBar";
import { Suspense } from "react";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    job_type?: string | string[];
  }>;
}

export const metadata = {
  title: "Browse Jobs | JobLink",
  description:
    "Find the latest job opportunities in Antigua and Barbuda. Filter by industry, location, job type, and more.",
};

export default async function JobsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl text-text">
              Browse Jobs
            </h1>
            <p className="mt-1 text-sm text-text-light">
              Discover opportunities across Antigua and Barbuda
            </p>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-4">
          <JobSearchBar defaultValue={params.q} />
        </div>
      </div>

      {/* Search query indicator */}
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
                    className="rounded-[--radius-card] border border-border bg-white p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-lg skeleton" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 skeleton" />
                        <div className="h-3 w-1/2 skeleton" />
                        <div className="h-3 w-1/3 skeleton" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            }
          >
            <JobResults
              searchParams={params}
              gridClassName="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
