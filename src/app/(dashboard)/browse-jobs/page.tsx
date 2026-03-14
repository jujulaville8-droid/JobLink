import JobResults from "@/components/JobResults";
import JobFilters from "@/components/JobFilters";
import { Suspense } from "react";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    job_type?: string | string[];
  }>;
}

export default async function DashboardBrowseJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display text-text">Browse Jobs</h1>
        <p className="mt-1 text-sm text-text-light">
          Discover opportunities across Antigua and Barbuda
        </p>
      </div>

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
        <Suspense fallback={null}>
          <JobFilters />
        </Suspense>

        <div className="flex-1 min-w-0">
          <Suspense
            fallback={
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
              gridClassName="grid grid-cols-1 lg:grid-cols-2 gap-4"
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
