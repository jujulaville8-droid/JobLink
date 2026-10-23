import Link from "next/link";
import { getJobClosure } from "@/lib/job-closures";
import { publicVacancyDescription } from "@/lib/public-vacancy-description";
import { getEmployerApproval } from "@/lib/seo/employerApproved";
import { JOB_TYPE_LABELS, JobType } from "@/lib/types";
import { displayJobLocation } from "@/lib/job-location";
import { loadApplyState, loadJobDetail } from "@/lib/job-detail";
import ApplyButton from "@/components/ApplyButton";
import SaveJobButton from "@/components/SaveJobButton";
import ReportListingButton from "@/components/ReportListingButton";
import { BackToResults, FocusDetailHeading } from "@/components/JobSplitNavigation";

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const panelClass =
  "rounded-[var(--radius-card)] border border-border bg-white p-5 sm:p-7 animate-fade-in";

function Unavailable({ backHref }: { backHref: string }) {
  return (
    <section aria-labelledby="job-detail-heading" className={panelClass}>
      <BackToResults href={backHref} />
      <h2 id="job-detail-heading" tabIndex={-1} className="font-display text-2xl text-text outline-none">
        This job is no longer available
      </h2>
      <p className="mt-2 text-sm text-text-light">
        It may have been filled or removed by the employer. Choose another listing from the results.
      </p>
      <FocusDetailHeading />
    </section>
  );
}

/** The selected listing on /jobs: the right-hand pane on desktop, a full-width view on mobile. */
export default async function JobDetailPane({ jobId, backHref }: { jobId: string; backHref: string }) {
  if (!JOB_ID_PATTERN.test(jobId)) return <Unavailable backHref={backHref} />;

  const { supabase, job, error, company } = await loadJobDetail(jobId);
  // Same availability rule as /jobs/[id]: only active listings are shown.
  if (error || !job || job.status !== "active") return <Unavailable backHref={backHref} />;

  const closure = getJobClosure(job.id, company?.id ?? job.company_id);
  const { user, applyState, isSaved } = await loadApplyState(supabase, job.id, !!closure);

  const employerApproval = getEmployerApproval(company?.id ?? job.company_id, job.id);
  const jobType: string = employerApproval?.jobTypeOverrides?.[job.id] ?? job.job_type;
  const jobTypeLabel = JOB_TYPE_LABELS[jobType as JobType] || jobType;
  const salary = job.salary_visible ? formatSalary(job.salary_min, job.salary_max) : "";
  const description = publicVacancyDescription(job);
  const location = displayJobLocation(job.location, company?.location);
  const whatsappText = encodeURIComponent(
    `Check out this job: ${job.title} at ${company?.company_name || "a company"} - https://joblinkantigua.com/jobs/${job.id}`
  );

  return (
    <section key={job.id} aria-labelledby="job-detail-heading" className={panelClass}>
      <BackToResults href={backHref} />

      {closure && (
        <div role="status" className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">This job is no longer available</p>
          <p className="mt-1 text-sm text-amber-800">{closure.reason}</p>
        </div>
      )}

      {/* ─── Header ─── */}
      <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0 flex-1">
          <h2
            id="job-detail-heading"
            tabIndex={-1}
            className="font-display text-[1.75rem] sm:text-[2rem] leading-tight text-text outline-none"
          >
            {job.title}
          </h2>
          {company ? (
            <Link
              href={`/companies/${company.id}`}
              className="mt-1 inline-block text-lg text-text-light hover:text-primary transition-colors"
            >
              {company.company_name}
            </Link>
          ) : (
            <p className="mt-1 text-lg text-text-light">Company</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-text-light">
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4 text-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {location || "Location not provided"}
            </span>
            <span aria-hidden="true" className="h-4 w-px bg-border" />
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-dark">
              {jobTypeLabel}
            </span>
          </div>
          <p className={`mt-3 text-sm ${salary ? "font-semibold text-text" : "text-text-light"}`}>
            {salary || "Salary discussed after application"}
          </p>
        </div>

        {/* One labelled action set; Apply goes straight to the existing application form. */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-start 2xl:shrink-0">
          <div className="col-span-2 whitespace-nowrap sm:min-w-40">
            <ApplyButton jobId={job.id} state={applyState} tone="primary" />
          </div>
          {user ? (
            <SaveJobButton jobId={job.id} initialSaved={isSaved} loggedIn large />
          ) : (
            <Link
              href={`/login?returnTo=/jobs/${job.id}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-white px-4 py-2.5 text-sm font-semibold text-text hover:border-primary hover:text-primary transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Save job
            </Link>
          )}
          <a
            href={`https://wa.me/?text=${whatsappText}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on WhatsApp"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-white px-4 py-2.5 text-sm font-semibold text-text hover:border-green-600 hover:text-green-700 transition-colors"
          >
            <svg className="h-4 w-4 text-green-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Share
          </a>
        </div>
      </div>

      {/* ─── Description ─── */}
      <div className="mt-6 border-t border-border pt-6">
        <h3 className="font-display text-2xl text-text">Job Description</h3>
        <div className="mt-3 whitespace-pre-wrap text-[0.9375rem] leading-[1.8] text-text-light">
          {description}
        </div>
      </div>

      {/* ─── Company ─── */}
      {company && (
        <div className="mt-6 border-t border-border pt-6">
          <h3 className="font-display text-2xl text-text">About the company</h3>
          {(company.industry || company.location) && (
            <p className="mt-2 text-sm text-text-muted">
              {[company.industry, company.location].filter(Boolean).join(" · ")}
            </p>
          )}
          {company.description?.trim() && (
            <p className="mt-3 whitespace-pre-wrap text-[0.9375rem] leading-[1.8] text-text-light line-clamp-6">
              {company.description}
            </p>
          )}
          <Link
            href={`/companies/${company.id}`}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary-dark"
          >
            View company profile
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/jobs/${job.id}`}
          className="inline-flex min-h-11 items-center text-sm text-text-light underline underline-offset-4 hover:text-primary"
        >
          Open full job page
        </Link>
        <ReportListingButton jobId={job.id} loggedIn={!!user} />
      </div>
      <FocusDetailHeading />
    </section>
  );
}
