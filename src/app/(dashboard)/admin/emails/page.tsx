import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminEmailActions from '@/components/AdminEmailActions'

const DRIP_CONFIG = [
  { step: 1, delayHours: 24 },
  { step: 2, delayHours: 72 },
  { step: 3, delayHours: 168 },
]

export default async function AdminEmailsPage() {
  await requireRole('admin')

  const supabase = createAdminClient()

  // Fetch all unverified auth users
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
  const lastSentAt = new Map<string, string>()
  for (const log of logs ?? []) {
    const current = maxDripSent.get(log.auth_user_id) ?? 0
    if (log.drip_step > current) {
      maxDripSent.set(log.auth_user_id, log.drip_step)
      lastSentAt.set(log.auth_user_id, log.sent_at)
    }
  }

  const now = Date.now()

  // Build pending users list (those with an eligible next drip)
  const pendingUsers = unverifiedUsers
    .map((user) => {
      const hoursSinceSignup = (now - new Date(user.created_at).getTime()) / (1000 * 60 * 60)
      const lastDrip = maxDripSent.get(user.id) ?? 0

      // Find next eligible drip
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
  const allComplete = drip3Sent

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold font-display text-primary sm:text-3xl">
        Signup Reminders
      </h1>
      <p className="mt-1 text-sm text-text-light">
        Manage reminder emails for users who signed up but never verified their account.
      </p>

      {/* Stat Cards */}
      <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Unverified"
          value={totalUnverified}
          color="text-amber-600"
          bg="bg-amber-50"
          borderColor="border-l-amber-500"
        />
        <StatCard
          label="Queued"
          value={pendingUsers.length}
          color="text-primary"
          bg="bg-primary/5"
          borderColor="border-l-primary"
        />
        <StatCard
          label="Drip 1 Sent"
          value={drip1Sent}
          color="text-blue-600"
          bg="bg-blue-50"
          borderColor="border-l-blue-500"
        />
        <StatCard
          label="Drip 2 Sent"
          value={drip2Sent}
          color="text-purple-600"
          bg="bg-purple-50"
          borderColor="border-l-purple-500"
        />
        <StatCard
          label="All 3 Sent"
          value={allComplete}
          color="text-emerald-600"
          bg="bg-emerald-50"
          borderColor="border-l-emerald-500"
        />
      </div>

      {/* All unverified users table */}
      <div className="mt-8">
        <AdminEmailActions
          pendingUsers={pendingUsers}
          totalPending={pendingUsers.length}
        />
      </div>

      {/* Full unverified list (read-only) */}
      {unverifiedUsers.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-text mb-3">
            All Unverified Signups ({totalUnverified})
          </h2>
          <div className="overflow-x-auto bg-white rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-alt">
                  <th className="text-left px-4 py-3 font-semibold text-text">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-text">Signed Up</th>
                  <th className="text-left px-4 py-3 font-semibold text-text">Reminder Status</th>
                </tr>
              </thead>
              <tbody>
                {unverifiedUsers
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((user) => {
                    const lastDrip = maxDripSent.get(user.id) ?? 0
                    return (
                      <tr key={user.id} className="border-b border-border last:border-0 hover:bg-bg-alt">
                        <td className="px-4 py-3 text-text">{user.email}</td>
                        <td className="px-4 py-3 text-text-light whitespace-nowrap">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {lastDrip === 0 ? (
                            <span className="text-text-muted text-xs">No reminders sent</span>
                          ) : lastDrip >= 3 ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/40">
                              All sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200/40">
                              {lastDrip} of 3 sent
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  bg,
  borderColor,
}: {
  label: string
  value: number
  color: string
  bg: string
  borderColor: string
}) {
  return (
    <div
      className={`rounded-2xl border border-border/40 bg-white p-5 border-l-4 ${borderColor}`}
    >
      <p className="text-xs text-text-muted font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{value.toLocaleString()}</p>
    </div>
  )
}
