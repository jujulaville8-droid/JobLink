import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JOB_TYPE_LABELS, JobType } from "@/lib/types";
import type { Metadata } from "next";
import ApplyButton from "@/components/ApplyButton";
import SaveJobButton from "@/components/SaveJobButton";
import ReportListingButton from "@/components/ReportListingButton";

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
    return { title: "Job Not Found | JobLinks" };
  }

  const company = job.company as unknown as { company_name: string } | null;

  return {
    title: `${job.title} at ${company?.company_name || "Company"} | JobLinks`,
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
  let isSaved = false;

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
        const [{ data: existing }, { data: savedJob }] = await Promise.all([
          supabase
            .from("applications")
            .select("id")
            .eq("job_id", job.id)
            .eq("seeker_id", profile.id)
            .maybeSingle(),
          supabase
            .from("saved_jobs")
            .select("id")
            .eq("job_id", job.id)
            .eq("seeker_id", profile.id)
            .maybeSingle(),
        ]);

        applyState = existing ? "applied" : "apply";
        isSaved = !!savedJob;
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
    <div className="min-h-screen bg-gray-50/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 animate-fade-up">
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

        {/* ─── Hero header card ─── */}
        <div className="rounded-2xl border border-border/60 bg-white shadow-sm p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Company logo */}
            {company?.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.company_name}
                className="shrink-0 h-16 w-16 rounded-xl object-cover border border-border/40"
              />
            ) : (
              <div
                className={`shrink-0 h-16 w-16 rounded-xl ${colors[colorIndex]} flex items-center justify-center text-white font-bold text-2xl shadow-sm`}
              >
                {companyInitial}
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Company name + badges row */}
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                {company ? (
                  <Link
                    href={`/companies/${company.id}`}
                    className="text-sm font-medium text-text-light hover:text-primary transition-colors"
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
                  <span className="text-xs text-text-muted">
                    &middot; {company.industry}
                  </span>
                )}
              </div>

              {/* Job title */}
              <h1 className="font-display text-2xl sm:text-3xl lg:text-[2rem] text-text leading-tight">
                {job.title}
              </h1>

              {/* Pills row */}
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                {/* Location */}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-text-light">
                  <svg
                    className="h-3.5 w-3.5"
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

                {/* Employment type */}
                <span className="inline-flex items-center rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                  {jobTypeLabel}
                </span>

                {/* Salary pill */}
                {salary && (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {salary}
                  </span>
                )}

                {/* Featured */}
                {job.is_featured && (
                  <span className="inline-flex items-center rounded-full bg-accent-warm/15 px-3 py-1 text-xs font-bold text-accent-warm uppercase tracking-wide">
                    Featured
                  </span>
                )}

                {/* New */}
                {isNew && (
                  <span className="inline-flex items-center rounded-full bg-coral/10 px-3 py-1 text-xs font-bold text-coral uppercase tracking-wide">
                    New
                  </span>
                )}
              </div>

              {/* Posted / expires */}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Posted {timeAgo(job.created_at)}
                </span>
                {job.expires_at && (
                  <span className="inline-flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Expires{" "}
                    {new Date(job.expires_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Two-column layout ─── */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Job Description card */}
            <div className="rounded-2xl border border-border/60 bg-white shadow-sm p-6 sm:p-8">
              <h2 className="font-display text-lg text-text mb-5 flex items-center gap-2">
                <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                Job Description
              </h2>
              <div className="text-text-light whitespace-pre-wrap leading-[1.8] text-[0.9375rem] min-h-[120px]">
                {job.description}
              </div>
            </div>

            {/* Actions row */}
            <div className="rounded-2xl border border-border/60 bg-white shadow-sm px-6 py-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* WhatsApp share */}
                <a
                  href={`https://wa.me/?text=${whatsappText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-white px-4 py-2 text-sm font-medium text-text-light hover:text-green-600 hover:border-green-200 transition-colors"
                >
                  <svg
                    className="h-4 w-4 text-green-600 shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Share
                </a>

                {/* Save job */}
                <SaveJobButton jobId={job.id} initialSaved={isSaved} loggedIn={!!user} />

                {/* Spacer */}
                <div className="flex-1" />

                {/* Report */}
                <ReportListingButton jobId={job.id} loggedIn={!!user} />
              </div>
            </div>
          </div>

          {/* ─── Right sidebar ─── */}
          <div className="w-full lg:w-[340px] shrink-0">
            <div className="lg:sticky lg:top-20 space-y-5">
              {/* Apply card */}
              <div className="rounded-2xl border border-border/60 bg-white shadow-sm p-6">
                <h2 className="font-display text-lg text-text mb-1">
                  Apply for this job
                </h2>
                <p className="text-xs text-text-muted mb-5">
                  {applyState === "login"
                    ? "Sign in to submit your application and track your status."
                    : applyState === "applied"
                    ? "You've already submitted your application for this role."
                    : applyState === "profile-incomplete"
                    ? "Complete your profile before applying."
                    : "Submit your application to get started."}
                </p>
                <ApplyButton jobId={job.id} state={applyState} />
                {salary && (
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Salary</span>
                      <span className="text-sm font-semibold text-emerald-700">
                        {salary}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Company card */}
              {company && (
                <div className="rounded-2xl border border-border/60 bg-white shadow-sm p-6">
                  <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-4">
                    About the Company
                  </h3>
                  <div className="flex items-center gap-3 mb-4">
                    {company.logo_url ? (
                      <img
                        src={company.logo_url}
                        alt={company.company_name}
                        className="shrink-0 h-11 w-11 rounded-xl object-cover border border-border/40"
                      />
                    ) : (
                      <div
                        className={`shrink-0 h-11 w-11 rounded-xl ${colors[colorIndex]} flex items-center justify-center text-white font-bold`}
                      >
                        {companyInitial}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text truncate">
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
                      </p>
                      {company.industry && (
                        <p className="text-xs text-text-muted truncate">
                          {company.industry}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {company.location && (
                      <div className="flex items-center gap-2 text-xs text-text-light">
                        <svg className="h-3.5 w-3.5 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {company.location}
                      </div>
                    )}
                    {company.website && (
                      <div className="flex items-center gap-2 text-xs text-text-light">
                        <svg className="h-3.5 w-3.5 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="2" y1="12" x2="22" y2="12" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-light hover:text-primary transition-colors truncate"
                        >
                          {company.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                        </a>
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/companies/${company.id}`}
                    className="flex items-center justify-center gap-1.5 w-full rounded-xl border-2 border-border/60 px-4 py-2.5 text-sm font-medium text-text-light hover:text-primary hover:border-primary/40 transition-all"
                  >
                    View company profile
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
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
    </div>
  );
}
