import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculateProfileCompletion } from "@/lib/profile-completion";
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

function StatCard({
  label,
  value,
  color = "primary",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  const colors: Record<string, string> = {
    primary: "bg-[#1e3a5f]",
    accent: "bg-[#e85d26]",
    green: "bg-green-600",
    purple: "bg-purple-600",
  };

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${colors[color] ?? colors.primary}`} />
        <p className="text-sm text-text-light">{label}</p>
      </div>
      <p className="mt-2 text-3xl font-bold text-text">{value}</p>
    </div>
  );
}

// ----- Seeker Dashboard -----
async function SeekerDashboard({ userId }: { userId: string }) {
  const supabase = await createClient();

  // Fetch seeker profile
  const { data: profile, error: profileError } = await supabase
    .from("seeker_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile && !profileError) {
    redirect("/profile");
  }

  if (!profile) {
    // RLS or query error — show empty state rather than redirect loop
    redirect("/profile");
  }

  const { percentage: completePct, missing } = calculateProfileCompletion(profile);
  const firstName = profile.first_name || "there";

  // Fetch recent applications (last 5) with job and company info
  const { data: applications } = await supabase
    .from("applications")
    .select("id, status, applied_at, job_listings(id, title, companies(company_name))")
    .eq("seeker_id", profile.id)
    .order("applied_at", { ascending: false })
    .limit(5);

  // Fetch recommended jobs (latest 4 active)
  const { data: recommendedJobs } = await supabase
    .from("job_listings")
    .select("id, title, location, job_type, created_at, companies(company_name)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(4);

  return (
    <div>
      {/* Welcome */}
      <h1 className="text-2xl font-bold text-text sm:text-3xl">
        Welcome back, {firstName}!
      </h1>
      <p className="mt-1 text-text-light">
        Here&apos;s what&apos;s happening with your job search.
      </p>

      {/* Profile Completion */}
      <div className="mt-6 rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-text">Profile Completion</h2>
            <p className="text-sm text-text-light">{completePct}% complete</p>
          </div>
          {completePct < 100 && (
            <Link
              href="/profile"
              className="rounded-lg bg-[#e85d26] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d14e1a] transition-colors"
            >
              Complete Profile
            </Link>
          )}
        </div>
        <div className="mt-3 h-3 w-full rounded-full bg-gray-100">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${completePct === 100 ? "bg-green-500" : "bg-[#1e3a5f]"}`}
            style={{ width: `${completePct}%` }}
          />
        </div>
        {missing.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-text-light">Missing:</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {missing.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Applications */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Recent Applications</h2>
          <Link href="/applications" className="text-sm font-medium text-[#1e3a5f] hover:underline">
            View all
          </Link>
        </div>

        {applications && applications.length > 0 ? (
          <div className="mt-4 space-y-3">
            {applications.map((app: Record<string, unknown>) => {
              const job = app.job_listings as Record<string, unknown> | null;
              const company = job?.companies as Record<string, unknown> | null;
              const status = app.status as ApplicationStatus;

              return (
                <div
                  key={app.id as string}
                  className="flex items-center justify-between rounded-lg border border-border bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/jobs/${job?.id ?? ""}`}
                      className="font-medium text-text hover:text-[#1e3a5f] hover:underline truncate block"
                    >
                      {(job?.title as string) ?? "Untitled"}
                    </Link>
                    <p className="text-sm text-text-light">
                      {(company?.company_name as string) ?? "Unknown Company"} &middot;{" "}
                      {new Date(app.applied_at as string).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`ml-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_COLORS[status] ?? STATUS_COLORS.applied}`}
                  >
                    {STATUS_LABELS[status] ?? status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-text-light">You haven&apos;t applied to any jobs yet.</p>
            <Link
              href="/jobs"
              className="mt-3 inline-block rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a4f7f] transition-colors"
            >
              Browse Jobs
            </Link>
          </div>
        )}
      </div>

      {/* Recommended Jobs */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-text">Recommended Jobs</h2>
        {recommendedJobs && recommendedJobs.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {recommendedJobs.map((job: Record<string, unknown>) => {
              const company = job.companies as Record<string, unknown> | null;
              return (
                <Link
                  key={job.id as string}
                  href={`/jobs/${job.id}`}
                  className="rounded-xl border border-border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <h3 className="font-semibold text-text">{job.title as string}</h3>
                  <p className="mt-1 text-sm text-text-light">
                    {(company?.company_name as string) ?? "Unknown Company"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-text-light">
                      {job.location as string}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {((job.job_type as string) ?? "").replace("_", " ")}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-text-light">No jobs available right now. Check back soon!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Employer Dashboard -----
async function EmployerDashboard({ userId }: { userId: string }) {
  const supabase = await createClient();

  // Get company
  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!company) {
    redirect("/company-profile");
  }

  const companyName = company.company_name || "your company";

  // Active listings count
  const { count: activeListings } = await supabase
    .from("job_listings")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .eq("status", "active");

  // Total applicants
  const { data: companyJobs } = await supabase
    .from("job_listings")
    .select("id")
    .eq("company_id", company.id);

  const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);

  let totalApplicants = 0;
  let monthApplicants = 0;
  let recentApplicants: Record<string, unknown>[] = [];

  if (jobIds.length > 0) {
    const { count: total } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("job_id", jobIds);
    totalApplicants = total ?? 0;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: monthCount } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("job_id", jobIds)
      .gte("applied_at", monthStart.toISOString());
    monthApplicants = monthCount ?? 0;

    // Recent applicants
    const { data: recent } = await supabase
      .from("applications")
      .select("id, status, applied_at, job_listings(title), seeker_profiles:seeker_id(first_name, last_name)")
      .in("job_id", jobIds)
      .order("applied_at", { ascending: false })
      .limit(5);
    recentApplicants = (recent as Record<string, unknown>[] | null) ?? [];
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text sm:text-3xl">
            Welcome back, {companyName}!
          </h1>
          <p className="mt-1 text-text-light">Manage your job listings and applicants.</p>
        </div>
        <Link
          href="/post-job"
          className="inline-flex items-center justify-center rounded-lg bg-[#e85d26] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d14e1a] transition-colors"
        >
          + Post a Job
        </Link>
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Active Listings" value={activeListings ?? 0} color="primary" />
        <StatCard label="Total Applicants" value={totalApplicants} color="accent" />
        <StatCard label="This Month" value={monthApplicants} color="green" />
      </div>

      {/* Recent Applicants */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-text">Recent Applicants</h2>
        {recentApplicants.length > 0 ? (
          <div className="mt-4 space-y-3">
            {recentApplicants.map((app) => {
              const seeker = app.seeker_profiles as Record<string, unknown> | null;
              const job = app.job_listings as Record<string, unknown> | null;
              const status = app.status as ApplicationStatus;

              return (
                <div
                  key={app.id as string}
                  className="flex items-center justify-between rounded-lg border border-border bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text">
                      {(seeker?.first_name as string) ?? ""} {(seeker?.last_name as string) ?? ""}
                    </p>
                    <p className="text-sm text-text-light">
                      Applied to {(job?.title as string) ?? "Untitled"} &middot;{" "}
                      {new Date(app.applied_at as string).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`ml-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.applied}`}
                  >
                    {STATUS_LABELS[status] ?? status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-text-light">No applicants yet. Post a job to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Admin Dashboard -----
async function AdminDashboard() {
  const supabase = await createClient();

  // Stats
  const { count: totalUsers } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true });

  const { count: totalJobs } = await supabase
    .from("job_listings")
    .select("id", { count: "exact", head: true });

  const { count: pendingApprovals } = await supabase
    .from("job_listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_approval");

  const { count: totalApplications } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true });

  // Recent signups
  const { data: recentUsers } = await supabase
    .from("users")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  // Pending job approvals
  const { data: pendingJobs } = await supabase
    .from("job_listings")
    .select("id, title, created_at, companies(company_name)")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text sm:text-3xl">Admin Dashboard</h1>
      <p className="mt-1 text-text-light">Platform overview and management.</p>

      {/* Stats */}
      <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={totalUsers ?? 0} color="primary" />
        <StatCard label="Total Jobs" value={totalJobs ?? 0} color="accent" />
        <StatCard label="Pending Approvals" value={pendingApprovals ?? 0} color="purple" />
        <StatCard label="Total Applications" value={totalApplications ?? 0} color="green" />
      </div>

      {/* Recent Signups */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-text">Recent Signups</h2>
        {recentUsers && recentUsers.length > 0 ? (
          <div className="mt-4 space-y-3">
            {recentUsers.map((u: Record<string, unknown>) => (
              <div
                key={u.id as string}
                className="flex items-center justify-between rounded-lg border border-border bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-medium text-text">{u.email as string}</p>
                  <p className="text-sm text-text-light">
                    Joined {new Date(u.created_at as string).toLocaleDateString()}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-text-light">
                  {u.role as string}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-text-light">No users yet.</p>
        )}
      </div>

      {/* Pending Approvals */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Pending Job Approvals</h2>
          <Link href="/admin/approvals" className="text-sm font-medium text-[#1e3a5f] hover:underline">
            View all
          </Link>
        </div>
        {pendingJobs && pendingJobs.length > 0 ? (
          <div className="mt-4 space-y-3">
            {pendingJobs.map((job: Record<string, unknown>) => {
              const company = job.companies as Record<string, unknown> | null;
              return (
                <div
                  key={job.id as string}
                  className="flex items-center justify-between rounded-lg border border-border bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="font-medium text-text">{job.title as string}</p>
                    <p className="text-sm text-text-light">
                      {(company?.company_name as string) ?? "Unknown"} &middot;{" "}
                      {new Date(job.created_at as string).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                    Pending
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-text-light">No pending approvals.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Main Page -----
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get role
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (userData?.role as string) ?? (user.user_metadata?.role as string) ?? "seeker";

  if (role === "admin") {
    return <AdminDashboard />;
  }

  if (role === "employer") {
    return <EmployerDashboard userId={user.id} />;
  }

  return <SeekerDashboard userId={user.id} />;
}
