import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/types";
import MessageButton from "@/components/messaging/MessageButton";

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: "bg-primary/10 text-primary",
  shortlisted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  hired: "bg-accent-warm/10 text-amber-700",
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  hired: "Hired",
};

export default async function ApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check seeker profile exists
  const { data: profile } = await supabase
    .from("seeker_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/profile");
  }

  // Fetch applications with job and company info
  const { data: applications } = await supabase
    .from("applications")
    .select(
      "id, status, applied_at, cover_letter_text, job_listings(id, title, location, job_type, companies(company_name, logo_url))"
    )
    .eq("seeker_id", profile.id)
    .order("applied_at", { ascending: false });

  const apps = (applications as Record<string, unknown>[] | null) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold font-display text-text sm:text-3xl">
        My Applications
      </h1>
      <p className="mt-1 text-text-light">
        Track the status of all your job applications.
      </p>

      {apps.length > 0 ? (
        <>
          {/* Summary */}
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center rounded-full bg-bg-alt px-3 py-1 text-sm font-medium text-text-light">
              {apps.length} total
            </span>
            {(["applied", "shortlisted", "rejected", "hired"] as ApplicationStatus[]).map(
              (status) => {
                const count = apps.filter(
                  (a) => a.status === status
                ).length;
                if (count === 0) return null;
                return (
                  <span
                    key={status}
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[status]}`}
                  >
                    {count} {STATUS_LABELS[status]}
                  </span>
                );
              }
            )}
          </div>

          {/* Applications list */}
          <div className="mt-6 space-y-3">
            {apps.map((app) => {
              const job = app.job_listings as Record<string, unknown> | null;
              const company = job?.companies as Record<string, unknown> | null;
              const status = app.status as ApplicationStatus;

              return (
                <div
                  key={app.id as string}
                  className="rounded-[--radius-card] border border-border bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/jobs/${job?.id ?? ""}`}
                        className="text-base font-semibold text-text hover:text-primary transition-colors duration-200"
                      >
                        {(job?.title as string) ?? "Untitled Position"}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-light">
                        <span>{(company?.company_name as string) ?? "Unknown Company"}</span>
                        {(job?.location as string) ? (
                          <>
                            <span className="hidden sm:inline">&middot;</span>
                            <span>{job?.location as string}</span>
                          </>
                        ) : null}
                        {(job?.job_type as string) ? (
                          <>
                            <span className="hidden sm:inline">&middot;</span>
                            <span className="capitalize">
                              {((job?.job_type as string) ?? "").replace("_", " ")}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.applied}`}
                      >
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-text-light">
                    <span>
                      Applied on{" "}
                      {new Date(app.applied_at as string).toLocaleDateString(
                        "en-US",
                        { year: "numeric", month: "long", day: "numeric" }
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <MessageButton
                        applicationId={app.id as string}
                        label="Message Employer"
                      />
                      <Link
                        href={`/jobs/${job?.id ?? ""}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:shadow-md hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        View Job
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* Empty state */
        <div className="mt-12 flex flex-col items-center justify-center rounded-[--radius-card] border-2 border-dashed border-border p-12 text-center">
          <svg
            className="h-16 w-16 text-text-light"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <h2 className="mt-4 text-lg font-semibold font-display text-text">
            No applications yet
          </h2>
          <p className="mt-1 text-text-light">
            You haven&apos;t applied to any jobs yet. Start browsing to find your
            next opportunity.
          </p>
          <Link
            href="/jobs"
            className="mt-6 inline-flex items-center rounded-[10px] bg-[#14919b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0d7377] transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-[#0d7377]/20"
          >
            Browse Jobs
          </Link>
        </div>
      )}
    </div>
  );
}
