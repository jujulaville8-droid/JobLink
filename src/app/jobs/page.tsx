import JobResults from "@/components/JobResults";
import JobFilters from "@/components/JobFilters";
import JobSearchBar from "@/components/JobSearchBar";
import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { INDUSTRIES } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    location?: string;
    category?: string;
    job_type?: string | string[];
    page?: string;
  }>;
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

/** One canonical URL format for a category page: /jobs?category=Food%20%26%20Beverage */
function categoryUrl(category: string): string {
  return `${JOBS_URL}?category=${encodeURIComponent(category)}`;
}

// Filtered /jobs URLs were being reported as soft 404s (empty categories),
// duplicates, or "crawled, not indexed". Rules:
// - A known category on its own gets a self canonical in one encoding, and is
//   indexable only while it has live jobs. Empty ones are noindex,follow so
//   they stay crawlable without being reported as soft 404s.
// - Search / job type / location / unknown-category combinations are
//   noindex,follow and canonical to /jobs.
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const hasOtherFilters = !!(params.q || params.location || params.job_type);
  if (!params.category && !hasOtherFilters) return baseMetadata;

  const noindex = { index: false, follow: true };
  const category = INDUSTRIES.find(
    (c) => c.toLowerCase() === params.category?.trim().toLowerCase()
  );
  if (!category || hasOtherFilters) {
    return { ...baseMetadata, robots: noindex };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("job_listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .eq("category", category);

  const url = categoryUrl(category);
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

      {params.location && <p className="mb-4 text-sm text-text-light">Location: <strong>{params.location}</strong></p>}

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
