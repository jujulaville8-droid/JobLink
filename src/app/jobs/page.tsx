import { closedJobIdFilter } from "@/lib/job-closures";
import JobResults from "@/components/JobResults";
import JobFilters from "@/components/JobFilters";
import JobSearchBar from "@/components/JobSearchBar";
import JobIndustryShortcuts from "@/components/JobIndustryShortcuts";
import JobDetailPane from "@/components/JobDetailPane";
import { RestoreListFocus } from "@/components/JobSplitNavigation";
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
    "Find the latest job opportunities in Antigua and Barbuda. Filter by industry, location, and job type. Apply in minutes on JobLink.",
  alternates: { canonical: JOBS_URL },
  openGraph: {
    title: "Browse Jobs in Antigua and Barbuda | JobLink",
    description:
      "Find the latest job opportunities in Antigua and Barbuda. Filter by industry, location, and job type.",
    url: JOBS_URL,
    siteName: "JobLink",
    images: [{ url: "/images/colorful-buildings.jpg", width: 1200, height: 630, alt: "JobLink — Browse Jobs" }],
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
      .not("id", "in", closedJobIdFilter())
      .eq("category", category);
    count = response.count;
  }

  const title = `${category} Jobs in Antigua and Barbuda`;
  const description = count
    ? `${count} open ${category} ${count === 1 ? "job" : "jobs"} in Antigua and Barbuda. Apply in minutes on JobLink.`
    : `${category} jobs in Antigua and Barbuda. Get an email alert when one is posted on JobLink.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    ...(count ? {} : { robots: noindex }),
    openGraph: { ...baseMetadata.openGraph, title: `${title} | JobLink`, description, url },
  };
}

/** The list query (search, filters, page) without the selected job. */
function listQuery(params: JobSearchParams): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.location) query.set("location", params.location);
  if (params.category) query.set("category", params.category);
  for (const type of [params.job_type ?? []].flat()) query.append("job_type", type);
  if (typeof params.page === "string" && params.page !== "1") query.set("page", params.page);
  return query.toString().replace(/\+/g, "%20");
}

/** With no ?job=, desktop shows the first listing in the results (featured first, as in the list). */
async function SelectedJob({ params, page, backHref }: { params: JobSearchParams; page: number; backHref: string }) {
  if (typeof params.job === "string") {
    return <JobDetailPane key={params.job} jobId={params.job} backHref={backHref} />;
  }
  const { jobs } = await getJobResults(params, page);
  const first = jobs?.find((job) => {
    const company = job.company as unknown as { is_pro?: boolean } | null;
    return job.is_featured || company?.is_pro;
  }) ?? jobs?.[0];
  if (!first) return null;
  return <JobDetailPane key={first.id} jobId={first.id} backHref={backHref} />;
}

function DetailSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-white p-7" aria-hidden="true">
      <div className="h-8 w-2/3 skeleton" />
      <div className="mt-3 h-5 w-1/3 skeleton" />
      <div className="mt-6 space-y-3">
        <div className="h-4 w-full skeleton" />
        <div className="h-4 w-full skeleton" />
        <div className="h-4 w-5/6 skeleton" />
      </div>
    </div>
  );
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

  const query = listQuery(params);
  const backHref = query ? `/jobs?${query}` : "/jobs";
  const selectedId = typeof params.job === "string" ? params.job : undefined;
  // Mobile shows either the list or the selected job, never both.
  const listOnlyOnDesktop = selectedId ? "hidden lg:block" : "";

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className={listOnlyOnDesktop}>
        {/* Page header */}
        <div className="mb-6">
          <h1 className="font-display text-[2.25rem] sm:text-5xl leading-[1.05] text-text">
            {category ? `${category} Jobs` : "Browse Jobs"}
          </h1>
          <p className="mt-2 text-base sm:text-lg text-text-light">
            {category
              ? `Browse ${category} job listings in Antigua and Barbuda.`
              : "Discover opportunities across Antigua and Barbuda"}
          </p>
          <div className="mt-5">
            <JobSearchBar defaultValue={params.q} defaultLocation={params.location} />
          </div>
        </div>

        {!params.q && !params.category && !params.location && !params.job_type && (
          <Suspense fallback={null}><JobIndustryShortcuts /></Suspense>
        )}

        <Suspense fallback={null}>
          <JobFilters layout="bar" />
        </Suspense>

        {/* Search query indicator */}
        {params.q && (
          <p className="mb-4 text-sm text-text-light">
            Results for{" "}
            <span className="font-semibold text-text">&ldquo;{params.q}&rdquo;</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Results */}
        <div className={`lg:w-[42%] lg:shrink-0 rounded-[var(--radius-card)] border border-border bg-white p-4 sm:p-5 ${listOnlyOnDesktop}`}>
          <Suspense
            fallback={
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-[var(--radius-card)] border border-border bg-white p-5">
                    <div className="h-4 w-3/4 skeleton" />
                    <div className="mt-2 h-3 w-1/2 skeleton" />
                    <div className="mt-2 h-3 w-1/3 skeleton" />
                  </div>
                ))}
              </div>
            }
          >
            <JobResults
              searchParams={params}
              prefetchedResults={prefetchedResults}
              gridClassName="grid grid-cols-1 gap-3"
              split={{ query, selectedId }}
            />
          </Suspense>
          {!selectedId && <RestoreListFocus href={backHref} />}
        </div>

        {/* Selected job */}
        <div key={`${query}:${selectedId ?? "first"}`} className={`min-w-0 flex-1 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:rounded-[var(--radius-card)] ${selectedId ? "" : "hidden lg:block"}`}>
          <Suspense key={selectedId ?? "first"} fallback={<DetailSkeleton />}>
            <SelectedJob params={params} page={page} backHref={backHref} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
