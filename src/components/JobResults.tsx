import JobCompanyCluster from "@/components/JobCompanyCluster";
import { groupJobs, type GroupedJob } from "@/lib/job-grouping";
import { closedJobIdFilter } from "@/lib/job-closures";
import { CONFIDENTIAL_EMPLOYER_COMPANY_ID, listingEmployerName, publicListingLogo } from "@/lib/confidential-employer";
import { loadConfidentialEmployerLogo } from "@/lib/confidential-employer-logo";
import { jobCategoryFilter, knownJobCategory } from "@/lib/job-category";
import JobCard, { Job } from "@/components/JobCard";
import Pagination from "@/components/Pagination";
import AlertToggle from "@/components/AlertToggle";
import Link from "next/link";
import { getJobResults, JOBS_PER_PAGE, type JobResultsData, type JobSearchParams } from "@/lib/job-results";
import { proCompanyFeatured } from "@/lib/featured";

interface JobResultsProps {
  searchParams: JobSearchParams;
  prefetchedResults?: JobResultsData;
  gridClassName?: string;
  /**
   * /jobs split view: cards select in place. `query` is the current list query
   * (without `job`); `selectedId` falls back to the first listing shown.
   */
  split?: { query: string; selectedId?: string };
}

export default async function JobResults({
  searchParams,
  prefetchedResults,
  gridClassName = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",
  split,
}: JobResultsProps) {
  const groupingApplies = !!split && !searchParams.q && !searchParams.location && !searchParams.job_type && !searchParams.category;
  searchParams = { ...searchParams, category: jobCategoryFilter(searchParams.category) };
  const category = knownJobCategory(searchParams.category);
  // /jobs validates pagination before its streaming shell. Keep the protected
  // /browse-jobs consumer's existing page parsing and loading behavior.
  const pageValue = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const requestedPage = Math.max(1, parseInt(pageValue || "1", 10) || 1);
  const { supabase, jobs, error, count, currentPage } = prefetchedResults
    ?? await getJobResults(searchParams, requestedPage);

  // Fetch saved job IDs for the current user (if logged in)
  let savedJobIds: Set<string> = new Set();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("seeker_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile) {
      const { data: savedJobs } = await supabase
        .from("saved_jobs")
        .select("job_id")
        .eq("seeker_id", profile.id);
      if (savedJobs) {
        savedJobIds = new Set(savedJobs.map((s) => s.job_id));
      }
    }
  }

  if (error) {
    return (
      <div className="rounded-card border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">
          Something went wrong loading jobs.
        </p>
        <p className="text-sm text-red-500 mt-1">Please try again later.</p>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    const searchLabel = searchParams.q
      ? `"${searchParams.q}"`
      : searchParams.category
        ? searchParams.category.toLowerCase()
        : "matching";

    return (
      <div className="rounded-card border border-border bg-gradient-to-b from-white to-bg-alt/40 p-10 sm:p-14 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <svg
            className="h-7 w-7 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <h3 className="mt-5 font-display text-xl text-text">
          No {searchLabel} jobs right now
        </h3>
        <p className="mt-2 text-sm text-text-light max-w-md mx-auto">
          {searchParams.location
            ? "No jobs match the recorded location and selected filters. Some listings do not provide a work location. Try another area or clear the location."
            : "Set up an email alert for new jobs using keywords, industry, or one job type."}
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <AlertToggle
            query={searchParams.q}
            category={searchParams.category}
            jobType={searchParams.job_type}
            location={searchParams.location}
            loggedIn={!!user}
            emphasis
          />
          <Link
            href="/jobs"
            className="text-sm font-medium text-text-light hover:text-primary transition-colors"
          >
            Or browse all jobs →
          </Link>
        </div>
      </div>
    );
  }

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / JOBS_PER_PAGE);

  const needsStandInLogo = jobs.some((job) => {
    const company = job.company as { id?: string; logo_url?: string | null; is_confidential?: boolean } | null;
    const companyId = company?.id ?? job.company_id ?? null;
    const confidential = job.is_confidential === true || company?.is_confidential === true;
    return confidential && companyId === CONFIDENTIAL_EMPLOYER_COMPANY_ID && !company?.logo_url;
  });
  const standInLogo = needsStandInLogo ? await loadConfidentialEmployerLogo() : null;

  const mappedJobs: Job[] = jobs.map((job) => {
    const company = job.company as unknown as {
      id: string;
      company_name: string;
      logo_url: string | null;
      is_pro: boolean;
      is_confidential?: boolean;
      location?: string | null;
    } | null;

    const confidential = job.is_confidential === true || company?.is_confidential === true;
    const companyId = company?.id ?? job.company_id ?? null;
    const logoUrl = company?.logo_url || (companyId === CONFIDENTIAL_EMPLOYER_COMPANY_ID ? standInLogo : null);
    return {
      id: job.id,
      company_id: confidential ? null : company?.id ?? null,
      title: job.title,
      company_name: listingEmployerName(job.is_confidential, company, "Company"),
      company_logo: publicListingLogo(confidential, {
        id: companyId,
        logo_url: logoUrl,
        is_confidential: company?.is_confidential,
      }),
      is_confidential: confidential,
      location: job.location,
      company_location: confidential ? null : company?.location ?? null,
      job_type: job.job_type,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_type: job.salary_type,
      salary_visible: job.salary_visible,
      created_at: job.created_at,
      is_featured: job.is_featured,
      is_pro_company: proCompanyFeatured(company),
    };
  });

  // Sort: Pro company listings first, then by original order
  mappedJobs.sort((a, b) => {
    const aPro = a.is_featured || a.is_pro_company ? 1 : 0;
    const bPro = b.is_featured || b.is_pro_company ? 1 : 0;
    return bPro - aPro;
  });

  let items: GroupedJob[] = mappedJobs.map((job) => ({ type: "job", job }));
  if (groupingApplies) {
    const companyIds = [...new Set(mappedJobs.flatMap((job) => job.company_id ? [job.company_id] : []))];
    if (companyIds.length) {
      const { data: totalsRows, error: totalsError } = await supabase
        .from("job_listings")
        .select("company_id")
        .eq("status", "active")
        .eq("is_confidential", false)
        .in("company_id", companyIds)
        .not("id", "in", closedJobIdFilter());
      // Keep cards flat if totals are unavailable rather than understate a total.
      if (!totalsError && totalsRows) {
        const totals = new Map<string, number>();
        for (const row of totalsRows) {
          if (row.company_id) totals.set(row.company_id, (totals.get(row.company_id) ?? 0) + 1);
        }
        items = groupJobs(mappedJobs, totals);
      }
    }
  }

  const selectedId = split ? split.selectedId ?? mappedJobs[0]?.id : undefined;
  const selectHref = (id: string) => `/jobs?${split?.query ? `${split.query}&` : ""}job=${encodeURIComponent(id)}`;

  return (
    <div className={split ? undefined : "animate-fade-up"}>
      {split && <h2 className="font-display text-[1.75rem] leading-tight text-text">Job results</h2>}
      <div className={`mb-4 flex items-center justify-between gap-3 ${split ? "mt-1" : ""}`}>
        <p className="text-sm text-text-light">
          <span className="font-semibold text-text">{totalCount}</span>{" "}
          {category ? `${category} ` : ""}
          {totalCount === 1 ? "job" : "jobs"} found
        </p>
        <AlertToggle
          query={searchParams.q}
          category={searchParams.category}
          jobType={searchParams.job_type}
          location={searchParams.location}
          loggedIn={!!user}
        />
      </div>
      <div className={`${gridClassName} stagger-children`}>
        {items.map((item) => {
          if (item.type === "cluster") return (
            <JobCompanyCluster key={item.company.id} {...item}
              defaultExpanded={item.jobs.some((job) => job.id === selectedId)}
              selectedId={selectedId} query={split?.query}
              savedJobIds={[...savedJobIds]} loggedIn={!!user} />
          );
          const job = item.job;
          return (
          <JobCard
            key={job.id}
            job={job}
            isSaved={savedJobIds.has(job.id)}
            loggedIn={!!user}
            highlight
            {...(split ? { selectHref: selectHref(job.id), selected: job.id === selectedId } : {})}
          />
        );
        })}
      </div>
      <Pagination currentPage={currentPage} totalPages={totalPages} />
    </div>
  );
}
