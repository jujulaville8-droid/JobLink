import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminEmailActions from '@/components/AdminEmailActions'
import AdminUnverifiedUsers from '@/components/AdminUnverifiedUsers'
import { JobNotificationBlast, ResumeImportanceBlast, TemplateSender } from '@/components/AdminEmailSender'

const DRIP_CONFIG = [
  { step: 1, delayHours: 24 },
  { step: 2, delayHours: 72 },
  { step: 3, delayHours: 168 },
]

export default async function AdminEmailsPage() {
  await requireRole('admin')

  const supabase = createAdminClient()

  // ── Fetch active job listings for the notification blast ───────────
  const { data: activeJobs } = await supabase
    .from('job_listings')
    .select('id, title, created_at, companies(company_name)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50)

  const jobsForBlast = (activeJobs ?? []).map((job) => {
    const company = Array.isArray(job.companies) ? job.companies[0] : job.companies
    return {
      id: job.id,
      title: job.title,
      company_name: (company as { company_name: string } | null)?.company_name || 'Unknown',
      created_at: job.created_at,
    }
  })

  // ── Fetch unverified auth users for signup reminders ───────────────
  const unverifiedUsers: { id: string; email: string; created_at: string }[] = []
  let page = 1
  const perPage = 1000

  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    })

    if (error) break

    for (const user of users) {
      if (!user.email_confirmed_at && user.email && user.created_at) {
        unverifiedUsers.push({
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        })
      }
    }

    if (users.length < perPage) break
    page++
  }

  // Get all reminder logs
  const userIds = unverifiedUsers.map((u) => u.id)
  const { data: logs } = userIds.length > 0
    ? await supabase
        .from('signup_reminder_log')
        .select('auth_user_id, drip_step, sent_at')
        .in('auth_user_id', userIds)
    : { data: [] }

  // Build lookup: auth_user_id → max drip_step sent
  const maxDripSent = new Map<string, number>()
  for (const log of logs ?? []) {
    const current = maxDripSent.get(log.auth_user_id) ?? 0
    if (log.drip_step > current) {
      maxDripSent.set(log.auth_user_id, log.drip_step)
    }
  }

  const now = Date.now()

  // Build pending users list (those with an eligible next drip)
  const pendingUsers = unverifiedUsers
    .map((user) => {
      const hoursSinceSignup = (now - new Date(user.created_at).getTime()) / (1000 * 60 * 60)
      const lastDrip = maxDripSent.get(user.id) ?? 0

      let nextDripStep = 0
      for (const drip of DRIP_CONFIG) {
        if (drip.step <= lastDrip) continue
        if (hoursSinceSignup >= drip.delayHours) {
          nextDripStep = drip.step
          break
        }
      }

      return {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        hoursSinceSignup: Math.round(hoursSinceSignup),
        nextDripStep,
        maxDripSent: lastDrip,
      }
    })
    .filter((u) => u.nextDripStep > 0)
    .sort((a, b) => b.hoursSinceSignup - a.hoursSinceSignup)

  // Stats
  const totalUnverified = unverifiedUsers.length
  const drip1Sent = [...maxDripSent.values()].filter((v) => v >= 1).length
  const drip2Sent = [...maxDripSent.values()].filter((v) => v >= 2).length
  const drip3Sent = [...maxDripSent.values()].filter((v) => v >= 3).length

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold font-display text-primary sm:text-3xl">
        Email Centre
      </h1>
      <p className="mt-1 text-sm text-text-light">
        Send job notifications, manage signup reminders, and send any email template manually.
      </p>

      {/* ── Section 1: Job Notification Blast ─────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-text mb-3">Job Notifications</h2>
        <JobNotificationBlast jobs={jobsForBlast} />
      </div>

      {/* ── Section 2: Resume Importance Blast ─────────────────────────── */}
      <div className="mt-10">
        <h2 className="text-base font-semibold text-text mb-3">Resume Campaign</h2>
        <ResumeImportanceBlast />
      </div>

      {/* ── Section 3: Send Any Template ──────────────────────────────── */}
      <div className="mt-10">
        <h2 className="text-base font-semibold text-text mb-3">Send Any Template</h2>
        <TemplateSender />
      </div>

      {/* ── Section 3: Signup Reminders ───────────────────────────────── */}
      <div className="mt-10">
        <h2 className="text-base font-semibold text-text mb-3">Signup Reminders</h2>

        {/* Stat Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5 mb-6">
          <StatCard label="Unverified" value={totalUnverified} borderColor="border-l-amber-500" />
          <StatCard label="Queued" value={pendingUsers.length} borderColor="border-l-primary" />
          <StatCard label="Drip 1 Sent" value={drip1Sent} borderColor="border-l-blue-500" />
          <StatCard label="Drip 2 Sent" value={drip2Sent} borderColor="border-l-purple-500" />
          <StatCard label="All 3 Sent" value={drip3Sent} borderColor="border-l-emerald-500" />
        </div>

        <AdminEmailActions
          pendingUsers={pendingUsers}
          totalPending={pendingUsers.length}
        />
      </div>

      {/* ── Section 4: All Unverified Users (with manual send) ─────────── */}
      {unverifiedUsers.length > 0 && (
        <div className="mt-10">
          <AdminUnverifiedUsers
            users={unverifiedUsers
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((user) => ({
                id: user.id,
                email: user.email,
                created_at: user.created_at,
                maxDripSent: maxDripSent.get(user.id) ?? 0,
              }))}
          />
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  borderColor,
}: {
  label: string
  value: number
  borderColor: string
}) {
  return (
    <div className={`rounded-2xl border border-border/40 bg-white p-5 border-l-4 ${borderColor}`}>
      <p className="text-xs text-text-muted font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{value.toLocaleString()}</p>
    </div>
  )
}
