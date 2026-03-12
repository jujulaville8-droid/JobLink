import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculateProfileCompletion } from "@/lib/profile-completion";
import type { ApplicationStatus } from "@/lib/types";
import AdminBentoDashboard from "@/components/AdminBentoDashboard";

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
    primary: "border-l-primary",
    accent: "border-l-primary-light",
    green: "border-l-emerald-500",
    purple: "border-l-purple-500",
  };

  return (
    <div className={`rounded-[--radius-card] border border-border bg-white p-5 shadow-sm border-l-4 ${colors[color] ?? colors.primary}`}>
      <p className="text-sm text-text-light">{label}</p>
      <p className="mt-2 text-3xl font-bold text-text">{value}</p>
    </div>
  );
}

// ----- Seeker Dashboard -----
async function SeekerDashboard({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("seeker_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile && !profileError) {
    redirect("/profile");
  }

  if (!profile) {
    redirect("/profile");
  }

  const { percentage: completePct, missing } = calculateProfileCompletion(profile);
  const firstName = profile.first_name || "there";

  const { data: applications } = await supabase
    .from("applications")
    .select("id, status, applied_at, job_listings(id, title, companies(company_name))")
    .eq("seeker_id", profile.id)
    .order("applied_at", { ascending: false })
    .limit(5);

  const { data: recommendedJobs } = await supabase
    .from("job_listings")
    .select("id, title, location, job_type, created_at, companies(company_name)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(4);

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl text-text sm:text-3xl">
        Welcome back, {firstName}!
      </h1>
      <p className="mt-1 text-text-light">
        Here&apos;s what&apos;s happening with your job search.
      </p>

      {/* Profile Completion */}
      <div className="mt-6 rounded-[--radius-card] border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-text">Profile Completion</h2>
            <p className="text-sm text-text-light">{completePct}% complete</p>
          </div>
          {completePct < 100 && (
            <Link
              href="/profile"
              className="btn-warm text-sm px-4 py-2"
            >
              Complete Profile
            </Link>
          )}
        </div>
        <div className="mt-3 h-3 w-full rounded-full bg-bg-alt">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${completePct === 100 ? "bg-emerald-500" : "bg-primary"}`}
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
                  className="inline-flex items-center rounded-full bg-accent-warm/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-accent-warm/20"
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
          <h2 className="font-display text-lg text-text">Recent Applications</h2>
          <Link href="/applications" className="text-sm font-medium text-primary hover:text-primary-dark link-animated">
            View all
          </Link>
        </div>

        {applications && applications.length > 0 ? (
          <div className="mt-4 space-y-3 stagger-children">
            {applications.map((app: Record<string, unknown>) => {
              const job = app.job_listings as Record<string, unknown> | null;
              const company = job?.companies as Record<string, unknown> | null;
              const status = app.status as ApplicationStatus;

              return (
                <div
                  key={app.id as string}
                  className="flex items-center justify-between rounded-[--radius-button] border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/jobs/${job?.id ?? ""}`}
                      className="font-medium text-text hover:text-primary transition-colors truncate block"
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
          <div className="mt-4 rounded-[--radius-card] border border-dashed border-border p-8 text-center">
            <p className="text-text-light">You haven&apos;t applied to any jobs yet.</p>
            <Link
              href="/jobs"
              className="mt-3 inline-block btn-primary text-sm px-4 py-2"
            >
              Browse Jobs
            </Link>
          </div>
        )}
      </div>

      {/* Recommended Jobs */}
      <div className="mt-8">
        <h2 className="font-display text-lg text-text">Recommended Jobs</h2>
        {recommendedJobs && recommendedJobs.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 stagger-children">
            {recommendedJobs.map((job: Record<string, unknown>) => {
              const company = job.companies as Record<string, unknown> | null;
              return (
                <Link
                  key={job.id as string}
                  href={`/jobs/${job.id}`}
                  className="rounded-[--radius-card] border border-border bg-white p-5 shadow-sm hover-lift transition-all"
                >
                  <h3 className="font-semibold text-text">{job.title as string}</h3>
                  <p className="mt-1 text-sm text-text-light">
                    {(company?.company_name as string) ?? "Unknown Company"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-bg-alt px-2.5 py-0.5 text-xs font-medium text-text-light">
                      {job.location as string}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {((job.job_type as string) ?? "").replace("_", " ")}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-[--radius-card] border border-dashed border-border p-8 text-center">
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

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!company) {
    redirect("/company-profile");
  }

  const companyName = company.company_name || "your company";

  // Company profile completion
  const companyFields = [
    company.company_name,
    company.description,
    company.logo_url,
    company.industry,
    company.website,
    company.location,
  ];
  const companyFilledFields = companyFields.filter(Boolean).length;
  const companyCompletePct = Math.round(
    (companyFilledFields / companyFields.length) * 100
  );
  const companyMissing: string[] = [];
  if (!company.description) companyMissing.push("Description");
  if (!company.logo_url) companyMissing.push("Logo");
  if (!company.industry) companyMissing.push("Industry");
  if (!company.website) companyMissing.push("Website");
  if (!company.location) companyMissing.push("Location");

  const { count: activeListings } = await supabase
    .from("job_listings")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .eq("status", "active");

  // Active listings with applicant counts
  const { data: activeJobsWithCounts } = await supabase
    .from("job_listings")
    .select("id, title, status, created_at, applications(count)")
    .eq("company_id", company.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: companyJobs } = await supabase
    .from("job_listings")
    .select("id")
    .eq("company_id", company.id);

  const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);

  let totalApplicants = 0;
  let weekApplicants = 0;
  let shortlistedCount = 0;
  let recentApplicants: Record<string, unknown>[] = [];

  if (jobIds.length > 0) {
    const { count: total } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("job_id", jobIds);
    totalApplicants = total ?? 0;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const { count: weekCount } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("job_id", jobIds)
      .gte("applied_at", weekStart.toISOString());
    weekApplicants = weekCount ?? 0;

    const { count: shortlisted } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("job_id", jobIds)
      .eq("status", "shortlisted");
    shortlistedCount = shortlisted ?? 0;

    const { data: recent } = await supabase
      .from("applications")
      .select("id, status, applied_at, job_id, job_listings(id, title), seeker_profiles:seeker_id(first_name, last_name)")
      .in("job_id", jobIds)
      .order("applied_at", { ascending: false })
      .limit(5);
    recentApplicants = (recent as Record<string, unknown>[] | null) ?? [];
  }

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-text sm:text-3xl">
            Welcome back, {companyName}!
          </h1>
          <p className="mt-1 text-text-light">Manage your listings, review applicants, and find talent.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/browse-candidates"
            className="btn-primary text-sm px-4 py-2"
          >
            Browse Candidates
          </Link>
          <Link
            href="/post-job"
            className="btn-warm"
          >
            + Post a Job
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard label="Active Listings" value={activeListings ?? 0} color="primary" />
        <StatCard label="Total Applicants" value={totalApplicants} color="accent" />
        <StatCard label="New This Week" value={weekApplicants} color="green" />
        <StatCard label="Shortlisted" value={shortlistedCount} color="purple" />
      </div>

      {/* Company Profile Completion */}
      {companyCompletePct < 100 && (
        <div className="mt-6 rounded-[--radius-card] border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-text">Company Profile</h2>
              <p className="text-sm text-text-light">{companyCompletePct}% complete</p>
            </div>
            <Link
              href="/company-profile"
              className="btn-warm text-sm px-4 py-2"
            >
              Complete Profile
            </Link>
          </div>
          <div className="mt-3 h-3 w-full rounded-full bg-bg-alt">
            <div
              className="h-3 rounded-full bg-primary transition-all duration-500"
              style={{ width: `${companyCompletePct}%` }}
            />
          </div>
          {companyMissing.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-text-light">Missing:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {companyMissing.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center rounded-full bg-accent-warm/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-accent-warm/20"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Listings Summary */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-text">Active Listings</h2>
          <Link href="/my-listings" className="text-sm font-medium text-primary hover:text-primary-dark link-animated">
            View all
          </Link>
        </div>
        {activeJobsWithCounts && activeJobsWithCounts.length > 0 ? (
          <div className="mt-4 space-y-3 stagger-children">
            {activeJobsWithCounts.map((job: Record<string, unknown>) => {
              const apps = job.applications as { count: number }[] | null;
              const appCount = apps?.[0]?.count ?? 0;
              return (
                <Link
                  key={job.id as string}
                  href={`/my-listings/${job.id}/applicants`}
                  className="flex items-center justify-between rounded-[--radius-button] border border-border bg-white p-4 shadow-sm hover:shadow-md hover:border-primary/20 transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text truncate">
                      {job.title as string}
                    </p>
                    <p className="text-sm text-text-light">
                      Posted {new Date(job.created_at as string).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                    {appCount} {appCount === 1 ? "applicant" : "applicants"}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-[--radius-card] border border-dashed border-border p-8 text-center">
            <p className="text-text-light">No active listings. Post a job to get started!</p>
            <Link
              href="/post-job"
              className="mt-3 inline-block btn-primary text-sm px-4 py-2"
            >
              Post a Job
            </Link>
          </div>
        )}
      </div>

      {/* Recent Applicants */}
      <div className="mt-8">
        <h2 className="font-display text-lg text-text">Recent Applicants</h2>
        {recentApplicants.length > 0 ? (
          <div className="mt-4 space-y-3 stagger-children">
            {recentApplicants.map((app) => {
              const seeker = app.seeker_profiles as Record<string, unknown> | null;
              const job = app.job_listings as Record<string, unknown> | null;
              const status = app.status as ApplicationStatus;

              return (
                <Link
                  key={app.id as string}
                  href={`/my-listings/${(job?.id as string) ?? ""}/applicants`}
                  className="flex items-center justify-between rounded-[--radius-button] border border-border bg-white p-4 shadow-sm hover:shadow-md hover:border-primary/20 transition-all"
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
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-[--radius-card] border border-dashed border-border p-8 text-center">
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

  const [
    { count: totalUsers },
    { count: totalSeekers },
    { count: totalEmployers },
    { count: totalJobs },
    { count: activeJobs },
    { count: pendingApprovals },
    { count: totalApplications },
  ] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "seeker"),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "employer"),
    supabase.from("job_listings").select("id", { count: "exact", head: true }),
    supabase.from("job_listings").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("job_listings").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    supabase.from("applications").select("id", { count: "exact", head: true }),
  ]);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { count: newUsersThisWeek } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .gte("created_at", weekAgo.toISOString());

  const { data: recentUsers } = await supabase
    .from("users")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: pendingJobs } = await supabase
    .from("job_listings")
    .select("id, title, created_at, companies(company_name)")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
    .limit(5);

  const stats = {
    totalUsers: totalUsers ?? 0,
    totalSeekers: totalSeekers ?? 0,
    totalEmployers: totalEmployers ?? 0,
    totalJobs: totalJobs ?? 0,
    activeJobs: activeJobs ?? 0,
    pendingApprovals: pendingApprovals ?? 0,
    totalApplications: totalApplications ?? 0,
    newUsersThisWeek: newUsersThisWeek ?? 0,
  };

  const formattedUsers = (recentUsers || []).map((u: Record<string, unknown>) => ({
    id: u.id as string,
    email: u.email as string,
    role: u.role as string,
    created_at: u.created_at as string,
  }));

  const formattedJobs = (pendingJobs || []).map((j: Record<string, unknown>) => {
    const company = j.companies as Record<string, unknown> | null;
    return {
      id: j.id as string,
      title: j.title as string,
      created_at: j.created_at as string,
      company_name: (company?.company_name as string) ?? "Unknown",
    };
  });

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl text-text sm:text-3xl">Admin Dashboard</h1>
      <p className="mt-1 text-text-light">Platform overview and management.</p>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard label="Total Users" value={stats.totalUsers} color="primary" />
        <StatCard label="Total Jobs" value={stats.totalJobs} color="accent" />
        <StatCard label="Pending Approvals" value={stats.pendingApprovals} color="purple" />
        <StatCard label="Total Applications" value={stats.totalApplications} color="green" />
      </div>

      {/* Bento dashboard */}
      <div className="mt-8">
        <AdminBentoDashboard
          stats={stats}
          recentUsers={formattedUsers}
          pendingJobs={formattedJobs}
        />
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
