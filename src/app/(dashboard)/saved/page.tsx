import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UnsaveButton from "./UnsaveButton";
import Pagination from "@/components/Pagination";

const ITEMS_PER_PAGE = 12;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function SavedJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("seeker_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/profile");
  }

  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const from = (currentPage - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE - 1;

  const { data: savedJobs, count } = await supabase
    .from("saved_jobs")
    .select(
      "id, saved_at, job_id, job_listings(id, title, description, location, job_type, salary_min, salary_max, salary_visible, created_at, companies(company_name, logo_url))",
      { count: "exact" }
    )
    .eq("seeker_id", profile.id)
    .order("saved_at", { ascending: false })
    .range(from, to);

  const saved = (savedJobs as Record<string, unknown>[] | null) ?? [];
  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE);

  return (
    <div>
      <h1 className="text-2xl font-bold font-display text-text sm:text-3xl">Saved Jobs</h1>
      <p className="mt-1 text-text-light">
        Jobs you&apos;ve bookmarked for later.
      </p>

      {saved.length > 0 ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {saved.map((item) => {
              const job = item.job_listings as Record<string, unknown> | null;
              const company = job?.companies as Record<string, unknown> | null;

              if (!job) return null;

              const salaryMin = job.salary_min as number | null;
              const salaryMax = job.salary_max as number | null;
              const salaryVisible = job.salary_visible as boolean;

              return (
                <div
                  key={item.id as string}
                  className="relative rounded-[--radius-card] border border-border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="absolute top-3 right-3">
                    <UnsaveButton savedJobId={item.id as string} />
                  </div>

                  <Link href={`/jobs/${job.id}`} className="block">
                    <h3 className="pr-8 font-semibold text-text hover:text-[#0d7377]">
                      {job.title as string}
                    </h3>
                    <p className="mt-1 text-sm text-text-light">
                      {(company?.company_name as string) ?? "Unknown Company"}
                    </p>

                    {(job.description as string) ? (
                      <p className="mt-2 text-sm text-text-light line-clamp-2">
                        {(job.description as string).substring(0, 120)}
                        {(job.description as string).length > 120 ? "..." : ""}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(job.location as string) ? (
                        <span className="inline-flex items-center rounded-full bg-bg-alt px-2.5 py-0.5 text-xs font-medium text-text-light">
                          {job.location as string}
                        </span>
                      ) : null}
                      {(job.job_type as string) ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 capitalize">
                          {((job.job_type as string) ?? "").replace("_", " ")}
                        </span>
                      ) : null}
                      {salaryVisible && (salaryMin || salaryMax) && (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          {salaryMin && salaryMax
                            ? `EC$${salaryMin.toLocaleString()} - EC$${salaryMax.toLocaleString()}`
                            : salaryMin
                              ? `From EC$${salaryMin.toLocaleString()}`
                              : `Up to EC$${salaryMax?.toLocaleString()}`}
                        </span>
                      )}
                    </div>
                  </Link>

                  <p className="mt-3 text-xs text-text-muted">
                    Saved{" "}
                    {new Date(item.saved_at as string).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" }
                    )}
                  </p>
                </div>
              );
            })}
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} />
        </>
      ) : (
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
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <h2 className="mt-4 text-lg font-semibold font-display text-text">
            No saved jobs yet
          </h2>
          <p className="mt-1 text-text-light">
            Browse jobs and bookmark the ones you&apos;re interested in.
          </p>
          <Link
            href="/jobs"
            className="mt-6 btn-primary text-sm"
          >
            Browse Jobs
          </Link>
        </div>
      )}
    </div>
  );
}
