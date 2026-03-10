import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import JobCard, { Job } from "@/components/JobCard";
import { JOB_TYPE_LABELS, JobType } from "@/lib/types";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("company_name")
    .eq("id", id)
    .single();

  if (!company) {
    return { title: "Company Not Found | JobLink" };
  }

  return {
    title: `${company.company_name} | JobLink`,
    description: `View ${company.company_name}'s profile and job listings on JobLink, Antigua's job platform.`,
  };
}

export default async function CompanyPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !company) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <svg
          className="mx-auto h-16 w-16 text-text-light/40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <h1 className="mt-4 text-2xl font-bold text-text">
          Company Not Found
        </h1>
        <p className="mt-2 text-text-light">
          This company profile doesn&apos;t exist or has been removed.
        </p>
        <Link
          href="/jobs"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-light transition-colors"
        >
          Browse jobs
        </Link>
      </div>
    );
  }

  // Fetch active jobs from this company
  const { data: jobs } = await supabase
    .from("job_listings")
    .select("*")
    .eq("company_id", id)
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  const mappedJobs: Job[] = (jobs || []).map((job) => {
    const jobTypeLabel =
      JOB_TYPE_LABELS[job.job_type as JobType] || job.job_type;
    return {
      id: job.id,
      title: job.title,
      company_name: company.company_name,
      company_logo: company.logo_url || null,
      location: job.location,
      job_type: jobTypeLabel,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_visible: job.salary_visible,
      created_at: job.created_at,
      is_featured: job.is_featured,
    };
  });

  // Deterministic color from company name
  const colors = [
    "bg-primary",
    "bg-accent",
    "bg-emerald-600",
    "bg-violet-600",
    "bg-rose-600",
    "bg-cyan-600",
  ];
  const colorIndex =
    company.company_name
      .split("")
      .reduce((a: number, c: string) => a + c.charCodeAt(0), 0) %
    colors.length;
  const initial = company.company_name.charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Back link */}
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-text-light hover:text-primary transition-colors mb-6"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to jobs
      </Link>

      {/* Company header card */}
      <div className="rounded-xl border border-border bg-white p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          {/* Logo / initial */}
          <div
            className={`shrink-0 h-20 w-20 rounded-xl ${colors[colorIndex]} flex items-center justify-center text-white font-bold text-3xl`}
          >
            {initial}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + verified badge */}
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-text">
                {company.company_name}
              </h1>
              {company.is_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Verified
                </span>
              )}
            </div>

            {/* Meta info */}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-light">
              {company.industry && (
                <span className="inline-flex items-center gap-1">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                  </svg>
                  {company.industry}
                </span>
              )}
              {company.location && (
                <span className="inline-flex items-center gap-1">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {company.location}
                </span>
              )}
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  {company.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>

            {/* Description */}
            {company.description && (
              <p className="mt-4 text-sm text-text-light leading-relaxed whitespace-pre-wrap">
                {company.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Active job listings */}
      <div>
        <h2 className="text-xl font-bold text-text mb-4">
          Open Positions
          {mappedJobs.length > 0 && (
            <span className="ml-2 text-base font-normal text-text-light">
              ({mappedJobs.length})
            </span>
          )}
        </h2>

        {mappedJobs.length === 0 ? (
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
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-text">
              No open positions
            </h3>
            <p className="mt-1 text-sm text-text-light">
              This company doesn&apos;t have any active job listings right now.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {mappedJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
