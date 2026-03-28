import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import AnalyticsCharts from '@/components/AnalyticsCharts'

function getLast30Days(): string[] {
  const days: string[] = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

function countByDate(
  rows: { created_at?: string; applied_at?: string }[] | null,
  dateField: 'created_at' | 'applied_at',
  dateMap: Map<string, number>
) {
  if (!rows) return
  for (const row of rows) {
    const val = row[dateField]
    if (!val) continue
    const day = val.split('T')[0]
    if (dateMap.has(day)) {
      dateMap.set(day, (dateMap.get(day) || 0) + 1)
    }
  }
}

export default async function AdminAnalyticsPage() {
  await requireRole('admin')
  const supabase = await createClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const since = thirtyDaysAgo.toISOString()

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  // Fetch all data in parallel
  // CV Builder metrics
  const [
    { count: cvProfilesStarted },
    { count: cvProfilesCompleted },
    { count: cvExportEvents },
    { count: cvQuickBuilderCompleted },
    { count: totalSeekerCount },
  ] = await Promise.all([
    supabase.from('cv_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('cv_profiles').select('id', { count: 'exact', head: true }).gte('completion_percentage', 80),
    supabase.from('cv_events').select('id', { count: 'exact', head: true }).eq('event_type', 'cv_downloaded_pdf'),
    supabase.from('cv_events').select('id', { count: 'exact', head: true }).eq('event_type', 'cv_quick_builder_completed'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'seeker').not('email', 'like', 'admin-company-%@joblinkantigua.com'),
  ])

  const [
    { count: totalUsers },
    { count: totalSeekers },
    { count: totalEmployers },
    { count: totalJobs },
    { count: activeJobs },
    { count: pendingJobs },
    { count: closedJobs },
    { count: totalApplications },
    { count: totalCompanies },
    { count: newUsersThisWeek },
    { count: appsThisWeek },
    { count: totalReports },
    { data: recentUsers },
    { data: recentSeekers },
    { data: recentEmployers },
    { data: recentApps },
    { data: recentJobs },
    { count: appliedCount },
    { count: interviewCount },
    { count: holdCount },
    { count: rejectedCount },
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'seeker').not('email', 'like', 'admin-company-%@joblinkantigua.com'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'employer'),
    supabase.from('job_listings').select('id', { count: 'exact', head: true }),
    supabase.from('job_listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('job_listings').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    supabase.from('job_listings').select('id', { count: 'exact', head: true }).eq('status', 'closed'),
    supabase.from('applications').select('id', { count: 'exact', head: true }),
    supabase.from('companies').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()).not('email', 'like', 'admin-company-%@joblinkantigua.com'),
    supabase.from('applications').select('id', { count: 'exact', head: true }).gte('applied_at', weekAgo.toISOString()),
    supabase.from('reported_listings').select('id', { count: 'exact', head: true }),
    // Time-series data (last 30 days)
    supabase.from('users').select('created_at').gte('created_at', since).not('email', 'like', 'admin-company-%@joblinkantigua.com'),
    supabase.from('users').select('created_at').gte('created_at', since).eq('role', 'seeker'),
    supabase.from('users').select('created_at').gte('created_at', since).eq('role', 'employer').not('email', 'like', 'admin-company-%@joblinkantigua.com'),
    supabase.from('applications').select('applied_at').gte('applied_at', since),
    supabase.from('job_listings').select('created_at').gte('created_at', since),
    // Application status counts
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'applied'),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'interview'),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'hold'),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
  ])

  // Build daily data
  const days = getLast30Days()

  const usersByDay = new Map(days.map((d) => [d, 0]))
  const seekersByDay = new Map(days.map((d) => [d, 0]))
  const employersByDay = new Map(days.map((d) => [d, 0]))
  const appsByDay = new Map(days.map((d) => [d, 0]))
  const jobsByDay = new Map(days.map((d) => [d, 0]))

  countByDate(recentUsers, 'created_at', usersByDay)
  countByDate(recentSeekers, 'created_at', seekersByDay)
  countByDate(recentEmployers, 'created_at', employersByDay)
  countByDate(recentApps, 'applied_at', appsByDay)
  countByDate(recentJobs, 'created_at', jobsByDay)

  const dailyData = days.map((day) => ({
    date: new Date(day + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    users: usersByDay.get(day) || 0,
    seekers: seekersByDay.get(day) || 0,
    employers: employersByDay.get(day) || 0,
    applications: appsByDay.get(day) || 0,
    jobs: jobsByDay.get(day) || 0,
  }))

  const jobStatusData = [
    { name: 'Active', value: activeJobs ?? 0 },
    { name: 'Pending', value: pendingJobs ?? 0 },
    { name: 'Closed', value: closedJobs ?? 0 },
  ].filter((d) => d.value > 0)

  const applicationStatusData = [
    { name: 'Applied', value: appliedCount ?? 0 },
    { name: 'Interview', value: interviewCount ?? 0 },
    { name: 'On Hold', value: holdCount ?? 0 },
    { name: 'Rejected', value: rejectedCount ?? 0 },
  ].filter((d) => d.value > 0)

  // Top jobs by applicant count
  const { data: topJobsRaw } = await supabase
    .from('applications')
    .select('job_id, job_listings(id, title, status, companies(company_name))')

  const jobAppCounts = new Map<string, { title: string; company: string; status: string; count: number }>()
  for (const app of topJobsRaw || []) {
    const listing = Array.isArray(app.job_listings) ? app.job_listings[0] : app.job_listings
    if (!listing) continue
    const existing = jobAppCounts.get(app.job_id)
    if (existing) {
      existing.count++
    } else {
      const comp = Array.isArray(listing.companies) ? listing.companies[0] : listing.companies
      jobAppCounts.set(app.job_id, {
        title: listing.title,
        company: (comp as { company_name: string } | null)?.company_name || 'Unknown',
        status: listing.status,
        count: 1,
      })
    }
  }
  const topJobs = Array.from(jobAppCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const totals = {
    totalUsers: totalUsers ?? 0,
    totalSeekers: totalSeekers ?? 0,
    totalEmployers: totalEmployers ?? 0,
    totalJobs: totalJobs ?? 0,
    activeJobs: activeJobs ?? 0,
    pendingJobs: pendingJobs ?? 0,
    closedJobs: closedJobs ?? 0,
    totalApplications: totalApplications ?? 0,
    totalCompanies: totalCompanies ?? 0,
    newUsersThisWeek: newUsersThisWeek ?? 0,
    appsThisWeek: appsThisWeek ?? 0,
    totalReports: totalReports ?? 0,
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold font-display text-primary mb-1">
        Analytics
      </h1>
      <p className="text-text-light text-sm mb-8">
        Platform-wide statistics, trends, and breakdowns.
      </p>

      <AnalyticsCharts
        dailyData={dailyData}
        jobStatusData={jobStatusData}
        applicationStatusData={applicationStatusData}
        totals={totals}
      />

      {/* Top Jobs by Applicants */}
      {topJobs.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold font-display text-text mb-4">Top Jobs by Applicants</h2>
          <div className="rounded-xl border border-border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-alt/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted hidden sm:table-cell">Company</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted hidden sm:table-cell">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Applicants</th>
                </tr>
              </thead>
              <tbody>
                {topJobs.map((job, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text truncate max-w-[200px] sm:max-w-none">{job.title}</p>
                      <p className="text-xs text-text-muted sm:hidden">{job.company}</p>
                    </td>
                    <td className="px-4 py-3 text-text-light hidden sm:table-cell">{job.company}</td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        job.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                        job.status === 'pending_approval' ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {job.status === 'active' ? 'Active' : job.status === 'pending_approval' ? 'Pending' : 'Closed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center justify-center min-w-[2rem] rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-bold text-primary">
                        {job.count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CV Builder Analytics */}
      <div className="mt-10">
        <h2 className="text-lg font-bold font-display text-text mb-4">Resume Builder</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CvStatCard
            label="Resumes Started"
            value={cvProfilesStarted ?? 0}
            subtitle={`${totalSeekerCount ? Math.round(((cvProfilesStarted ?? 0) / (totalSeekerCount ?? 1)) * 100) : 0}% of seekers`}
          />
          <CvStatCard
            label="Resumes Completed"
            value={cvProfilesCompleted ?? 0}
            subtitle={cvProfilesStarted ? `${Math.round(((cvProfilesCompleted ?? 0) / (cvProfilesStarted ?? 1)) * 100)}% completion rate` : 'No Resumes yet'}
          />
          <CvStatCard
            label="Quick Builder Completions"
            value={cvQuickBuilderCompleted ?? 0}
          />
          <CvStatCard
            label="PDF Exports"
            value={cvExportEvents ?? 0}
          />
        </div>
      </div>
    </div>
  )
}

function CvStatCard({ label, value, subtitle }: { label: string; value: number; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{value.toLocaleString()}</p>
      {subtitle && <p className="mt-1 text-xs text-text-light">{subtitle}</p>}
    </div>
  )
}
