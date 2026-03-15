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
    { count: shortlistedCount },
    { count: hiredCount },
    { count: rejectedCount },
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'seeker'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'employer'),
    supabase.from('job_listings').select('id', { count: 'exact', head: true }),
    supabase.from('job_listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('job_listings').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    supabase.from('job_listings').select('id', { count: 'exact', head: true }).eq('status', 'closed'),
    supabase.from('applications').select('id', { count: 'exact', head: true }),
    supabase.from('companies').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
    supabase.from('applications').select('id', { count: 'exact', head: true }).gte('applied_at', weekAgo.toISOString()),
    supabase.from('reported_listings').select('id', { count: 'exact', head: true }),
    // Time-series data (last 30 days)
    supabase.from('users').select('created_at').gte('created_at', since),
    supabase.from('users').select('created_at').gte('created_at', since).eq('role', 'seeker'),
    supabase.from('users').select('created_at').gte('created_at', since).eq('role', 'employer'),
    supabase.from('applications').select('applied_at').gte('applied_at', since),
    supabase.from('job_listings').select('created_at').gte('created_at', since),
    // Application status counts
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'applied'),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'shortlisted'),
    supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'hired'),
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
    { name: 'Shortlisted', value: shortlistedCount ?? 0 },
    { name: 'Hired', value: hiredCount ?? 0 },
    { name: 'Rejected', value: rejectedCount ?? 0 },
  ].filter((d) => d.value > 0)

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
    </div>
  )
}
