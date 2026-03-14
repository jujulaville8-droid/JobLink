import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JOB_TYPE_LABELS, JobType } from "@/lib/types";
import type { Metadata } from "next";
import ApplyButton from "@/components/ApplyButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("job_listings")
    .select("title, company:companies(company_name)")
    .eq("id", id)
    .single();

  if (!job) {
    return { title: "Job Not Found | JobLink" };
  }

  const company = job.company as unknown as { company_name: string } | null;

  return {
    title: `${job.title} at ${company?.company_name || "Company"} | JobLink`,
    description: `Apply for ${job.title} at ${company?.company_name || "a company"} in Antigua and Barbuda.`,
  };
}

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return "";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "XCD",
      maximumFractionDigits: 0,
    }).format(n);
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("job_listings")
    .select(
      `
      *,
      company:companies (
        id,
        company_name,
        logo_url,
        description,
        industry,
        location,
        website,
        is_verified
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !job || job.status !== "active") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <svg
          className="mx-auto h-16 w-16 text-text-muted/40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h1 className="mt-4 font-display text-2xl text-text">Job Not Found</h1>
        <p className="mt-2 text-text-light">
          This listing may have been removed or is no longer active.
        </p>
        <Link
          href="/jobs"
          className="mt-6 inline-flex items-center gap-2 btn-primary text-sm"
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
          Browse all jobs
        </Link>
      </div>
    );
  }

  const company = job.company as unknown as {
    id: string;
    company_name: string;
    logo_url: string | null;
    description: string | null;
    industry: string | null;
    location: string | null;
    website: string | null;
    is_verified: boolean;
  } | null;

  const isNew =
    new Date().getTime() - new Date(job.created_at).getTime() <
    24 * 60 * 60 * 1000;

  const salary =
    job.salary_visible ? formatSalary(job.salary_min, job.salary_max) : null;

  const jobTypeLabel =
    JOB_TYPE_LABELS[job.job_type as JobType] || job.job_type;

  const jobUrl = `https://joblinkantigua.com/jobs/${job.id}`;
  const whatsappText = encodeURIComponent(
    `Check out this job: ${job.title} at ${company?.company_name || "a company"} - ${jobUrl}`
  );

  // ─── Auth & application state for dynamic Apply button ───
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let applyState: "apply" | "login" | "not-seeker" | "applied" | "closed" | "profile-incomplete" = "login";

  if (job.status !== "active") {
    applyState = "closed";
  } else if (!user) {
    applyState = "login";
  } else {
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!userData || userData.role !== "seeker") {
      applyState = "not-seeker";
    } else {
      const { data: profile } = await supabase
        .from("seeker_profiles")
        .select("id, first_name, last_name, phone, cv_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile || !profile.first_name || !profile.last_name || !profile.phone || !profile.cv_url) {
        applyState = "profile-incomplete";
      } else {
        const { data: existing } = await supabase
          .from("applications")
          .select("id")
          .eq("job_id", job.id)
          .eq("seeker_id", profile.id)
          .maybeSingle();

        applyState = existing ? "applied" : "apply";
      }
    }
  }

  const companyInitial = company?.company_name?.charAt(0).toUpperCase() || "?";
  const colors = [
    "bg-primary",
    "bg-accent",
    "bg-emerald-600",
    "bg-violet-600",
    "bg-rose-600",
    "bg-cyan-600",
  ];
  const colorIndex = company?.company_name
    ? company.company_name
        .split("")
        .reduce((a: number, c: string) => a + c.charCodeAt(0), 0) %
      colors.length
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-up">
      {/* Back link */}
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-text-light hover:text-primary transition-colors mb-6 link-animated"
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

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="rounded-[--radius-card] border border-border bg-white p-6 sm:p-8">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {job.is_featured && (
                <span className="inline-flex items-center rounded-full bg-accent-warm text-white px-2.5 py-0.5 text-xs font-bold uppercase">
                  Featured
                </span>
              )}
              {isNew && (
                <span className="inline-flex items-center rounded-full bg-coral text-white px-2.5 py-0.5 text-xs font-bold uppercase">
                  New
                </span>
              )}
            </div>

            {/* Company info */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`shrink-0 h-12 w-12 rounded-lg ${colors[colorIndex]} flex items-center justify-center text-white font-bold text-lg`}
              >
                {companyInitial}
              </div>
              <div>
                {company ? (
                  <Link
                    href={`/companies/${company.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {company.company_name}
                    {company.is_verified && (
                      <svg
                        className="inline-block ml-1 h-4 w-4 text-blue-500"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </Link>
                ) : (
                  <span className="text-sm text-text-light">Company</span>
                )}
                {company?.industry && (
                  <p className="text-xs text-text-light">{company.industry}</p>
                )}
              </div>
            </div>

            {/* Title */}
            <h1 className="font-display text-2xl sm:text-3xl text-text">
              {job.title}
            </h1>

            {/* Meta info */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-text-light">
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
                {job.location}
              </span>

              <span className="inline-flex items-center rounded-full bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
                {jobTypeLabel}
              </span>

              {salary && (
                <span className="font-semibold text-primary">{salary}</span>
              )}
            </div>

            {/* Dates */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-text-light">
              <span>Posted {timeAgo(job.created_at)}</span>
              {job.expires_at && (
                <span>
                  Expires{" "}
                  {new Date(job.expires_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>

            <hr className="my-6 border-border" />

            {/* Description */}
            <div className="prose prose-sm max-w-none">
              <h2 className="font-display text-lg text-text mb-3">
                Job Description
              </h2>
              <div className="text-text-light whitespace-pre-wrap leading-relaxed text-sm">
                {job.description}
              </div>
            </div>

            <hr className="my-6 border-border" />

            {/* Share + Report */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <a
                href={`https://wa.me/?text=${whatsappText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[--radius-button] bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Share on WhatsApp
              </a>

              <Link
                href={`/report?job_id=${job.id}`}
                className="text-sm text-text-light hover:text-red-500 transition-colors"
              >
                Report this listing
              </Link>
            </div>
          </div>
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-20 space-y-4">
            {/* Apply card */}
            <div className="rounded-[--radius-card] border border-border bg-white p-6">
              <h2 className="font-display text-lg text-text mb-4">
                Interested in this role?
              </h2>
              <ApplyButton jobId={job.id} state={applyState} />
              {salary && (
                <p className="mt-3 text-center text-sm text-text-light">
                  Salary: {salary}
                </p>
              )}
            </div>

            {/* Company card */}
            {company && (
              <div className="rounded-[--radius-card] border border-border bg-white p-6">
                <h2 className="text-sm font-semibold text-text-light uppercase tracking-wider mb-3">
                  About the Company
                </h2>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`shrink-0 h-10 w-10 rounded-lg ${colors[colorIndex]} flex items-center justify-center text-white font-bold`}
                  >
                    {companyInitial}
                  </div>
                  <div>
                    <Link
                      href={`/companies/${company.id}`}
                      className="text-sm font-semibold text-text hover:text-primary transition-colors"
                    >
                      {company.company_name}
                      {company.is_verified && (
                        <svg
                          className="inline-block ml-1 h-3.5 w-3.5 text-blue-500"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </Link>
                    {company.industry && (
                      <p className="text-xs text-text-light">
                        {company.industry}
                      </p>
                    )}
                  </div>
                </div>
                {company.location && (
                  <p className="text-xs text-text-light mb-1">
                    {company.location}
                  </p>
                )}
                {company.website && (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {company.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <Link
                  href={`/companies/${company.id}`}
                  className="mt-3 block text-center rounded-[--radius-button] border border-border px-4 py-2 text-sm font-medium text-text-light hover:text-primary hover:border-primary/30 transition-colors"
                >
                  View company profile
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Spacer for mobile sticky bar */}
      <div className="h-20 lg:hidden" />

      {/* Mobile sticky apply button */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.08)] lg:hidden">
        <ApplyButton jobId={job.id} state={applyState} />
      </div>
    </div>
  );
}
