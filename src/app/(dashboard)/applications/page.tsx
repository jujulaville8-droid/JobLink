import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/types";

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: "bg-blue-100 text-blue-800",
  shortlisted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  hired: "bg-purple-100 text-purple-800",
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
    .eq("seeker_id", user.id)
    .order("applied_at", { ascending: false });

  const apps = (applications as Record<string, unknown>[] | null) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-text sm:text-3xl">
        My Applications
      </h1>
      <p className="mt-1 text-text-light">
        Track the status of all your job applications.
      </p>

      {apps.length > 0 ? (
        <>
          {/* Summary */}
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-text-light">
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
                  className="rounded-xl border border-border bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/jobs/${job?.id ?? ""}`}
                        className="text-base font-semibold text-text hover:text-[#0d7377] hover:underline"
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
                    <Link
                      href={`/jobs/${job?.id ?? ""}`}
                      className="font-medium text-[#0d7377] hover:underline"
                    >
                      View Job
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* Empty state */
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12 text-center">
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
          <h2 className="mt-4 text-lg font-semibold text-text">
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
