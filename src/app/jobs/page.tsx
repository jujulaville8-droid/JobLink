import JobResults from "@/components/JobResults";
import JobFilters from "@/components/JobFilters";
import JobSearchBar from "@/components/JobSearchBar";
import JobIndustryShortcuts from "@/components/JobIndustryShortcuts";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { knownJobCategory } from "@/lib/job-category";
import { getJobResults, isJobPageOutOfRange, parseJobPage, type JobSearchParams } from "@/lib/job-results";

interface PageProps {
  searchParams: Promise<JobSearchParams>;
}

const JOBS_URL = "https://joblinkantigua.com/jobs";

const baseMetadata: Metadata = {
  title: "Browse Jobs in Antigua and Barbuda",
  description:
    "Find the latest job opportunities in Antigua and Barbuda. Filter by industry, location, and job type. Apply in minutes on JobLinks.",
  alternates: { canonical: JOBS_URL },
  openGraph: {
    title: "Browse Jobs in Antigua and Barbuda | JobLinks",
    description:
      "Find the latest job opportunities in Antigua and Barbuda. Filter by industry, location, and job type.",
    url: JOBS_URL,
    siteName: "JobLinks",
    images: [{ url: "/images/colorful-buildings.jpg", width: 1200, height: 630, alt: "JobLinks — Browse Jobs" }],
  },
};

/** Keep category spelling/encoding stable, and give each real page its own URL. */
function jobsUrl(category: string | undefined, page: number): string {
  const query = [
    ...(category ? [`category=${encodeURIComponent(category)}`] : []),
    ...(page > 1 ? [`page=${page}`] : []),
  ];
  return `${JOBS_URL}${query.length ? `?${query.join("&")}` : ""}`;
}

const noindex = { index: false, follow: true };

// Clear the inherited root canonical as well as /jobs for invalid or failed
// pagination. An error response must not present itself as a copy of page one.
const unavailablePageMetadata: Metadata = {
  ...baseMetadata,
  alternates: { canonical: null },
  robots: noindex,
  openGraph: { ...baseMetadata.openGraph, url: undefined },
};

// Known categories and unfiltered browsing have one canonical per real page.
// Search / job type / location / unknown-category combinations remain noindex,
// follow and canonical to /jobs. A genuine empty first category page also stays
// noindex,follow; missing later pages are handled before the page starts streaming.
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const page = parseJobPage(params.page);
  if (page === null) return unavailablePageMetadata;

  const results = page > 1 ? await getJobResults(params, page) : undefined;
  if (results && (results.error || isJobPageOutOfRange(results))) return unavailablePageMetadata;

  const hasOtherFilters = !!(params.q || params.location || params.job_type);
  const category = knownJobCategory(params.category);
  if ((!category && params.category) || hasOtherFilters) {
    return { ...baseMetadata, robots: noindex };
  }

  const url = jobsUrl(category, page);
  if (!category) {
    return {
      ...baseMetadata,
      alternates: { canonical: url },
      openGraph: { ...baseMetadata.openGraph, url },
    };
  }

  // First-page metadata keeps its inexpensive count query. Later pages reuse
  // the exact result already used for existence validation and rendering.
  let count = results?.count;
  if (!results) {
    const supabase = await createClient();
    const response = await supabase
      .from("job_listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .eq("category", category);
    count = response.count;
  }

  const title = `${category} Jobs in Antigua and Barbuda`;
  const description = count
    ? `${count} open ${category} ${count === 1 ? "job" : "jobs"} in Antigua and Barbuda. Apply in minutes on JobLinks.`
    : `${category} jobs in Antigua and Barbuda. Get an email alert when one is posted on JobLinks.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    ...(count ? {} : { robots: noindex }),
    openGraph: { ...baseMetadata.openGraph, title: `${title} | JobLinks`, description, url },
  };
}

export default async function JobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const category = knownJobCategory(params.category);
  const page = parseJobPage(params.page);
  if (page === null) notFound();

  // Await before returning any Suspense shell: a late notFound() can only send
  // a streamed 200 + noindex, not the actual 404 required for missing pages.
  const prefetchedResults = page > 1 ? await getJobResults(params, page) : undefined;
  if (prefetchedResults && isJobPageOutOfRange(prefetchedResults)) notFound();
  if (prefetchedResults?.error) throw new Error("Unable to load the requested jobs page");

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl text-text">
              {category ? `${category} Jobs` : "Browse Jobs"}
            </h1>
            <p className="mt-1 text-sm text-text-light">
              {category
                ? `Browse ${category} job listings in Antigua and Barbuda.`
                : "Discover opportunities across Antigua and Barbuda"}
            </p>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-4">
          <JobSearchBar defaultValue={params.q} />
        </div>
      </div>

      {params.location && <p className="mb-4 text-sm text-text-light">Location: <strong>{params.location}</strong></p>}

      {!params.q && !params.category && !params.location && !params.job_type && (
        <Suspense fallback={null}><JobIndustryShortcuts /></Suspense>
      )}

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
              prefetchedResults={prefetchedResults}
              gridClassName="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
