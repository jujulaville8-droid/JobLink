import { createClient } from "@/lib/supabase/server";
import JobCard, { Job } from "@/components/JobCard";
import Pagination from "@/components/Pagination";
import AlertToggle from "@/components/AlertToggle";

const JOBS_PER_PAGE = 12;

interface JobResultsProps {
  searchParams: {
    q?: string;
    category?: string;
    job_type?: string | string[];
    page?: string;
  };
  gridClassName?: string;
}

export default async function JobResults({
  searchParams,
  gridClassName = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",
}: JobResultsProps) {
  const supabase = await createClient();

  const currentPage = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
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
    const keyword = `%${searchParams.q}%`;
    query = query.or(`title.ilike.${keyword},description.ilike.${keyword}`);
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
      <div className="rounded-[--radius-card] border border-red-200 bg-red-50 p-6 text-center">
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
      <div className="rounded-[--radius-card] border border-border bg-gradient-to-b from-white to-bg-alt/40 p-10 sm:p-14 text-center">
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
          Be the first to know when one posts. We&apos;ll email you the moment a matching job goes live in Antigua.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <AlertToggle
            query={searchParams.q}
            category={searchParams.category}
            jobType={searchParams.job_type}
            loggedIn={!!user}
            emphasis
          />
          <a
            href="/jobs"
            className="text-sm font-medium text-text-light hover:text-primary transition-colors"
          >
            Or browse all jobs →
          </a>
        </div>
      </div>
    );
  }

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / JOBS_PER_PAGE);

  const mappedJobs: Job[] = jobs.map((job) => {
    const company = job.company as unknown as {
      id: string;
      company_name: string;
      logo_url: string | null;
      is_pro: boolean;
    } | null;

    return {
      id: job.id,
      title: job.title,
      company_name: company?.company_name || "Company",
      company_logo: company?.logo_url || null,
      location: job.location,
      job_type: job.job_type,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_visible: job.salary_visible,
      created_at: job.created_at,
      is_featured: job.is_featured,
      is_pro_company: company?.is_pro ?? false,
    };
  });

  // Sort: Pro company listings first, then by original order
  mappedJobs.sort((a, b) => {
    const aPro = a.is_featured || a.is_pro_company ? 1 : 0;
    const bPro = b.is_featured || b.is_pro_company ? 1 : 0;
    return bPro - aPro;
  });

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-text-light">
          <span className="font-semibold text-text">{totalCount}</span>{" "}
          {totalCount === 1 ? "job" : "jobs"} found
        </p>
        <AlertToggle
          query={searchParams.q}
          category={searchParams.category}
          jobType={searchParams.job_type}
          loggedIn={!!user}
        />
      </div>
      <div className={`${gridClassName} stagger-children`}>
        {mappedJobs.map((job) => (
          <JobCard key={job.id} job={job} isSaved={savedJobIds.has(job.id)} loggedIn={!!user} />
        ))}
      </div>
      <Pagination currentPage={currentPage} totalPages={totalPages} />
    </div>
  );
}
