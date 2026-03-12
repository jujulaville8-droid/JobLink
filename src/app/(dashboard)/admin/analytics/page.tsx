import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export default async function AdminAnalyticsPage() {
  await requireRole('admin')
  const supabase = await createClient()

  const { count: totalUsers } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })

  const { count: totalSeekers } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'seeker')

  const { count: totalEmployers } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'employer')

  const { count: totalJobs } = await supabase
    .from('job_listings')
    .select('id', { count: 'exact', head: true })

  const { count: activeJobs } = await supabase
    .from('job_listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  const { count: pendingJobs } = await supabase
    .from('job_listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_approval')

  const { count: closedJobs } = await supabase
    .from('job_listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'closed')

  const { count: totalApplications } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })

  const { count: totalCompanies } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true })

  // Users this week
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { count: newUsersThisWeek } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', weekAgo.toISOString())

  // Applications this week
  const { count: appsThisWeek } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .gte('applied_at', weekAgo.toISOString())

  const stats = [
    { label: 'Total Users', value: totalUsers ?? 0, color: 'border-l-primary' },
    { label: 'Seekers', value: totalSeekers ?? 0, color: 'border-l-emerald-500' },
    { label: 'Employers', value: totalEmployers ?? 0, color: 'border-l-blue-500' },
    { label: 'Companies', value: totalCompanies ?? 0, color: 'border-l-purple-500' },
    { label: 'Total Jobs', value: totalJobs ?? 0, color: 'border-l-primary' },
    { label: 'Active Jobs', value: activeJobs ?? 0, color: 'border-l-emerald-500' },
    { label: 'Pending Approval', value: pendingJobs ?? 0, color: 'border-l-amber-500' },
    { label: 'Closed Jobs', value: closedJobs ?? 0, color: 'border-l-red-500' },
    { label: 'Total Applications', value: totalApplications ?? 0, color: 'border-l-primary' },
    { label: 'New Users (7d)', value: newUsersThisWeek ?? 0, color: 'border-l-emerald-500' },
    { label: 'Applications (7d)', value: appsThisWeek ?? 0, color: 'border-l-blue-500' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold font-display text-primary mb-2">Analytics</h1>
      <p className="text-text-light text-sm mb-8">Platform-wide statistics and metrics.</p>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-[--radius-card] border border-border bg-white p-5 shadow-sm border-l-4 ${stat.color}`}
          >
            <p className="text-sm text-text-light">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-text">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
