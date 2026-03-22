import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculateProfileCompletion } from "@/lib/profile-completion";
import type { ApplicationStatus } from "@/lib/types";
import AdminBentoDashboard from "@/components/AdminBentoDashboard";

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: "bg-primary/10 text-primary",
  interview: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  hold: "bg-accent-warm/10 text-amber-700",
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected",
  hold: "On Hold",
};

function StatCard({
  label,
  value,
  icon,
  color = "primary",
  href,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  href?: string;
}) {
  const colors: Record<string, { border: string; iconBg: string; iconText: string }> = {
    primary: { border: "border-l-primary", iconBg: "bg-primary/10", iconText: "text-primary" },
    accent: { border: "border-l-primary-light", iconBg: "bg-blue-50", iconText: "text-blue-600" },
    green: { border: "border-l-emerald-500", iconBg: "bg-emerald-50", iconText: "text-emerald-600" },
    purple: { border: "border-l-purple-500", iconBg: "bg-purple-50", iconText: "text-purple-600" },
    amber: { border: "border-l-amber-500", iconBg: "bg-amber-50", iconText: "text-amber-600" },
  };

  const c = colors[color] ?? colors.primary;
  const content = (
    <div className={`rounded-[--radius-card] border border-border bg-white p-5 shadow-sm border-l-4 ${c.border} ${href ? 'hover:shadow-md hover:border-primary/20 transition-all cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-light">{label}</p>
          <p className="mt-1 text-3xl font-bold text-text">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center ${c.iconText}`}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
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

      {/* Profile Completion - hidden when 100% */}
      {completePct < 100 && (
        <div className="mt-6 rounded-[--radius-card] border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-text">Profile Completion</h2>
              <p className="text-sm text-text-light">{completePct}% complete</p>
            </div>
            <Link
              href="/profile"
              className="btn-warm text-sm px-4 py-2"
            >
              Complete Profile
            </Link>
          </div>
          <div className="mt-3 h-3 w-full rounded-full bg-bg-alt">
            <div
              className="h-3 rounded-full bg-primary transition-all duration-500"
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
      )}

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

  // Fetch all listing counts in parallel
  const [
    { count: activeListings },
    { count: pendingListings },
  ] = await Promise.all([
    supabase
      .from("job_listings")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("status", "active"),
    supabase
      .from("job_listings")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("status", "pending_approval"),
  ]);

  // Active listings with applicant counts
  const { data: activeJobsWithCounts } = await supabase
    .from("job_listings")
    .select("id, title, status, created_at, expires_at, applications(count)")
    .eq("company_id", company.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(5);

  // Pending listings
  const { data: pendingJobs } = await supabase
    .from("job_listings")
    .select("id, title, created_at")
    .eq("company_id", company.id)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
    .limit(3);

  const { data: companyJobs } = await supabase
    .from("job_listings")
    .select("id")
    .eq("company_id", company.id);

  const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);

  let totalApplicants = 0;
  let recentApplicants: Record<string, unknown>[] = [];

  // Count unread messages
  const { data: unreadData } = await supabase.rpc("get_total_unread_count", {
    p_user_id: userId,
  });
  const unreadMessages = (unreadData as number | null) ?? 0;

  if (jobIds.length > 0) {
    const [
      { count: total },
      { data: recent },
    ] = await Promise.all([
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .in("job_id", jobIds),
      supabase
        .from("applications")
        .select("id, status, applied_at, job_id, job_listings(id, title), seeker_profiles:seeker_id(first_name, last_name)")
        .in("job_id", jobIds)
        .order("applied_at", { ascending: false })
        .limit(5),
    ]);

    totalApplicants = total ?? 0;
    recentApplicants = (recent as Record<string, unknown>[] | null) ?? [];
  }

  // Check for expiring listings (within 7 days)
  const now = new Date();
  const soonExpiry = new Date(now);
  soonExpiry.setDate(soonExpiry.getDate() + 7);
  const expiringJobs = (activeJobsWithCounts ?? []).filter((job: Record<string, unknown>) => {
    if (!job.expires_at) return false;
    const exp = new Date(job.expires_at as string);
    return exp <= soonExpiry && exp >= now;
  });

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  function daysUntil(dateStr: string): number {
    const diff = new Date(dateStr).getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="animate-fade-up">
      {/* Header */}
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

      {/* Pro Status */}
      {!company.is_pro && (
        <div className="mt-6 rounded-[--radius-card] border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-text">Upgrade to Pro</p>
                <p className="text-sm text-text-light">Get featured listings, priority support, and more visibility.</p>
              </div>
            </div>
            <Link
              href="/company-profile"
              className="btn-warm text-sm px-5 py-2 whitespace-nowrap"
            >
              Upgrade Now
            </Link>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          label="Active Listings"
          value={activeListings ?? 0}
          color="primary"
          href="/my-listings"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
            </svg>
          }
        />
        <StatCard
          label="Total Applicants"
          value={totalApplicants}
          color="accent"
          href="/my-listings"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
        />
        <StatCard
          label="Pending Review"
          value={pendingListings ?? 0}
          color="amber"
          href="/my-listings?filter=pending"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
        />
        <StatCard
          label="Unread Messages"
          value={unreadMessages}
          color="green"
          href="/messages"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          }
        />
      </div>

      {/* Alerts Row: Pending Listings + Expiring Listings */}
      {((pendingListings ?? 0) > 0 || expiringJobs.length > 0) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* Pending Listings Alert */}
          {(pendingListings ?? 0) > 0 && (
            <div className="rounded-[--radius-card] border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">
                    {pendingListings} listing{(pendingListings ?? 0) !== 1 ? 's' : ''} pending review
                  </p>
                  {pendingJobs && pendingJobs.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {pendingJobs.map((job: Record<string, unknown>) => (
                        <p key={job.id as string} className="text-xs text-amber-700 truncate">
                          {job.title as string} — submitted {formatDate(job.created_at as string)}
                        </p>
                      ))}
                    </div>
                  )}
                  <Link
                    href="/my-listings?filter=pending"
                    className="mt-2 inline-block text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
                  >
                    View pending listings &rarr;
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Expiring Listings Alert */}
          {expiringJobs.length > 0 && (
            <div className="rounded-[--radius-card] border border-red-200 bg-red-50/50 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="h-4 w-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-800">
                    {expiringJobs.length} listing{expiringJobs.length !== 1 ? 's' : ''} expiring soon
                  </p>
                  <div className="mt-2 space-y-1">
                    {expiringJobs.map((job: Record<string, unknown>) => (
                      <p key={job.id as string} className="text-xs text-red-700 truncate">
                        {job.title as string} — {daysUntil(job.expires_at as string)} day{daysUntil(job.expires_at as string) !== 1 ? 's' : ''} left
                      </p>
                    ))}
                  </div>
                  <Link
                    href="/my-listings?filter=active"
                    className="mt-2 inline-block text-xs font-semibold text-red-700 hover:text-red-900 transition-colors"
                  >
                    Manage listings &rarr;
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* Two-column layout: Active Listings + Recent Applicants */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Active Listings */}
        <div>
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
                        Posted {formatDate(job.created_at as string)}
                        {(job.expires_at as string | null) && (
                          <span className="text-text-muted"> &middot; Expires {formatDate(job.expires_at as string)}</span>
                        )}
                      </p>
                    </div>
                    <span className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary whitespace-nowrap">
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
        <div>
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
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                        {((seeker?.first_name as string) ?? "?").charAt(0)}
                        {((seeker?.last_name as string) ?? "").charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-text truncate">
                          {(seeker?.first_name as string) ?? ""} {(seeker?.last_name as string) ?? ""}
                        </p>
                        <p className="text-xs text-text-light truncate">
                          {(job?.title as string) ?? "Untitled"} &middot;{" "}
                          {formatDate(app.applied_at as string)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`ml-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_COLORS[status] ?? STATUS_COLORS.applied}`}
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
    { count: totalReports },
    { count: proSubscribers },
  ] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "seeker"),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "employer"),
    supabase.from("job_listings").select("id", { count: "exact", head: true }),
    supabase.from("job_listings").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("job_listings").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    supabase.from("applications").select("id", { count: "exact", head: true }),
    supabase.from("reported_listings").select("id", { count: "exact", head: true }),
    supabase.from("companies").select("id", { count: "exact", head: true }).eq("is_pro", true),
  ]);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [
    { count: newUsersThisWeek },
    { count: newSeekersThisWeek },
    { count: newEmployersThisWeek },
  ] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
    supabase.from("users").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()).eq("role", "seeker"),
    supabase.from("users").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()).eq("role", "employer"),
  ]);

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

  const { data: activeJobsForShare } = await supabase
    .from("job_listings")
    .select("id, title, location, job_type, salary_min, salary_max, salary_visible, created_at, companies(company_name)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(10);

  const stats = {
    totalUsers: totalUsers ?? 0,
    totalSeekers: totalSeekers ?? 0,
    totalEmployers: totalEmployers ?? 0,
    totalJobs: totalJobs ?? 0,
    activeJobs: activeJobs ?? 0,
    pendingApprovals: pendingApprovals ?? 0,
    totalApplications: totalApplications ?? 0,
    totalReports: totalReports ?? 0,
    proSubscribers: proSubscribers ?? 0,
    newUsersThisWeek: newUsersThisWeek ?? 0,
    newSeekersThisWeek: newSeekersThisWeek ?? 0,
    newEmployersThisWeek: newEmployersThisWeek ?? 0,
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

  const JOB_TYPE_DISPLAY: Record<string, string> = {
    full_time: "Full Time",
    part_time: "Part Time",
    seasonal: "Seasonal",
    contract: "Contract",
  };

  const shareableJobs = (activeJobsForShare || []).map((j: Record<string, unknown>) => {
    const company = j.companies as Record<string, unknown> | null;
    return {
      id: j.id as string,
      title: j.title as string,
      company_name: (company?.company_name as string) ?? "Unknown",
      location: (j.location as string) ?? "Antigua",
      job_type: JOB_TYPE_DISPLAY[(j.job_type as string)] ?? (j.job_type as string),
      salary_min: j.salary_min as number | null,
      salary_max: j.salary_max as number | null,
      salary_visible: (j.salary_visible as boolean) ?? false,
      created_at: j.created_at as string,
    };
  });

  return (
    <div>
      <h1 className="font-display text-2xl text-text sm:text-3xl">Admin Dashboard</h1>
      <p className="mt-1 text-text-light mb-6">Platform overview and management.</p>

      <AdminBentoDashboard
        stats={stats}
        recentUsers={formattedUsers}
        pendingJobs={formattedJobs}
        shareableJobs={shareableJobs}
      />
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
