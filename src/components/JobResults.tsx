import { createClient } from "@/lib/supabase/server";
import JobCard, { Job } from "@/components/JobCard";
import Pagination from "@/components/Pagination";

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
    return (
      <div className="rounded-[--radius-card] border border-border bg-white dark:bg-card p-10 text-center">
        <svg
          className="mx-auto h-12 w-12 text-text-muted/50"
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
        <h3 className="mt-4 font-display text-lg text-text">No jobs found</h3>
        <p className="mt-1 text-sm text-text-light">
          Try adjusting your filters or search terms to find more opportunities.
        </p>
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
      <p className="mb-4 text-sm text-text-light">
        <span className="font-semibold text-text">{totalCount}</span>{" "}
        {totalCount === 1 ? "job" : "jobs"} found
      </p>
      <div className={`${gridClassName} stagger-children`}>
        {mappedJobs.map((job) => (
          <JobCard key={job.id} job={job} isSaved={savedJobIds.has(job.id)} loggedIn={!!user} />
        ))}
      </div>
      <Pagination currentPage={currentPage} totalPages={totalPages} />
    </div>
  );
}
