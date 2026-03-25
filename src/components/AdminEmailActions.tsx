'use client'

import React, { useState } from 'react'

interface PendingUser {
  id: string
  email: string
  created_at: string
  hoursSinceSignup: number
  nextDripStep: number
  maxDripSent: number
}

interface Props {
  pendingUsers: PendingUser[]
  totalPending: number
}

const DRIP_LABELS: Record<number, string> = {
  1: 'Reminder 1 — Verify your account',
  2: 'Reminder 2 — Still waiting for you',
  3: 'Reminder 3 — Final reminder',
}

function timeAgo(hours: number): string {
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.floor(hours)}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function dripBadge(step: number) {
  if (step === 0) return null
  const colors =
    step === 1
      ? 'bg-blue-50 text-blue-700 border-blue-200/40'
      : step === 2
        ? 'bg-amber-50 text-amber-700 border-amber-200/40'
        : 'bg-red-50 text-red-600 border-red-200/40'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${colors}`}>
      Drip {step} sent
    </span>
  )
}

export default function AdminEmailActions({ pendingUsers, totalPending }: Props) {
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({})
  const [sendingMap, setSendingMap] = useState<Record<string, boolean>>({})
  const [sendingAll, setSendingAll] = useState(false)
  const [allSentCount, setAllSentCount] = useState<number | null>(null)

  async function handleSendOne(user: PendingUser) {
    setSendingMap((prev) => ({ ...prev, [user.id]: true }))
    try {
      const res = await fetch('/api/admin/emails/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_user_id: user.id,
          email: user.email,
          drip_step: user.nextDripStep,
        }),
      })
      if (res.ok) {
        setSentMap((prev) => ({ ...prev, [user.id]: true }))
      }
    } catch {
      // silent
    } finally {
      setSendingMap((prev) => ({ ...prev, [user.id]: false }))
    }
  }

  async function handleSendAll() {
    setSendingAll(true)
    try {
      const res = await fetch('/api/admin/emails/send-all', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setAllSentCount(data.sent ?? 0)
        // Mark all as sent
        const newSentMap: Record<string, boolean> = {}
        for (const u of pendingUsers) {
          newSentMap[u.id] = true
        }
        setSentMap(newSentMap)
      }
    } catch {
      // silent
    } finally {
      setSendingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header row with Send All */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">
            Pending Signup Reminders
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            {totalPending} unverified user{totalPending !== 1 ? 's' : ''} with emails ready to send
          </p>
        </div>
        {totalPending > 0 && (
          <button
            onClick={handleSendAll}
            disabled={sendingAll || allSentCount !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendingAll ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending...
              </>
            ) : allSentCount !== null ? (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {allSentCount} sent
              </>
            ) : (
              `Send All (${totalPending})`
            )}
          </button>
        )}
      </div>

      {/* Table */}
      {pendingUsers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center">
          <svg className="mx-auto h-16 w-16 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-text">No pending reminders</h3>
          <p className="mt-1 text-sm text-text-muted">
            All unverified users have already received their reminders, or there are no unverified signups yet.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-alt">
                <th className="text-left px-4 py-3 font-semibold text-text">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-text">Signed Up</th>
                <th className="text-left px-4 py-3 font-semibold text-text">Last Sent</th>
                <th className="text-left px-4 py-3 font-semibold text-text">Next Email</th>
                <th className="text-center px-4 py-3 font-semibold text-text">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((user) => {
                const isSent = sentMap[user.id]
                const isSending = sendingMap[user.id]

                return (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-bg-alt transition-colors">
                    <td className="px-4 py-3 text-text">{user.email}</td>
                    <td className="px-4 py-3 text-text-light whitespace-nowrap">
                      {timeAgo(user.hoursSinceSignup)}
                    </td>
                    <td className="px-4 py-3">
                      {user.maxDripSent > 0 ? dripBadge(user.maxDripSent) : (
                        <span className="text-text-muted text-xs">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-light text-xs">
                      {DRIP_LABELS[user.nextDripStep] || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isSent ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Sent
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSendOne(user)}
                          disabled={isSending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          {isSending ? (
                            <>
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Sending
                            </>
                          ) : (
                            'Send Now'
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
