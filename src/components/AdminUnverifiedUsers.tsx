'use client'

import React, { useState } from 'react'

interface UnverifiedUser {
  id: string
  email: string
  created_at: string
  maxDripSent: number
}

interface Props {
  users: UnverifiedUser[]
}

export default function AdminUnverifiedUsers({ users }: Props) {
  // Track per-user sending state and which drip was just sent
  const [sendingMap, setSendingMap] = useState<Record<string, boolean>>({})
  const [sentMap, setSentMap] = useState<Record<string, number>>({})
  const [selectedDrip, setSelectedDrip] = useState<Record<string, number>>({})

  function getNextDrip(user: UnverifiedUser): number {
    const alreadySent = sentMap[user.id] ?? user.maxDripSent
    return Math.min(alreadySent + 1, 3)
  }

  function getDripForUser(user: UnverifiedUser): number {
    return selectedDrip[user.id] ?? getNextDrip(user)
  }

  function getEffectiveMaxDrip(user: UnverifiedUser): number {
    return sentMap[user.id] ?? user.maxDripSent
  }

  async function handleSend(user: UnverifiedUser) {
    const drip = getDripForUser(user)
    if (drip > 3) return

    setSendingMap((prev) => ({ ...prev, [user.id]: true }))
    try {
      const res = await fetch('/api/admin/emails/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_user_id: user.id,
          email: user.email,
          drip_step: drip,
        }),
      })
      if (res.ok) {
        setSentMap((prev) => ({
          ...prev,
          [user.id]: Math.max(prev[user.id] ?? user.maxDripSent, drip),
        }))
        // Reset selected drip so it auto-advances to next
        setSelectedDrip((prev) => {
          const copy = { ...prev }
          delete copy[user.id]
          return copy
        })
      }
    } catch {
      // silent
    } finally {
      setSendingMap((prev) => ({ ...prev, [user.id]: false }))
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-text mb-3">
        All Unverified Signups ({users.length})
      </h2>
      <div className="overflow-x-auto bg-white rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-alt">
              <th className="text-left px-4 py-3 font-semibold text-text">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-text">Signed Up</th>
              <th className="text-left px-4 py-3 font-semibold text-text">Status</th>
              <th className="text-center px-4 py-3 font-semibold text-text">Send Reminder</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const effectiveMax = getEffectiveMaxDrip(user)
              const isSending = sendingMap[user.id]
              const allDone = effectiveMax >= 3
              const drip = getDripForUser(user)

              return (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-bg-alt transition-colors">
                  <td className="px-4 py-3 text-text">{user.email}</td>
                  <td className="px-4 py-3 text-text-light whitespace-nowrap">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {effectiveMax === 0 ? (
                      <span className="text-text-muted text-xs">No reminders sent</span>
                    ) : effectiveMax >= 3 ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/40">
                        All sent
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200/40">
                        {effectiveMax} of 3 sent
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {allDone ? (
                      <div className="flex items-center justify-center">
                        <span className="text-xs text-text-muted">Complete</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <select
                          value={drip}
                          onChange={(e) =>
                            setSelectedDrip((prev) => ({
                              ...prev,
                              [user.id]: Number(e.target.value),
                            }))
                          }
                          className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        >
                          {[1, 2, 3]
                            .filter((step) => step > effectiveMax)
                            .map((step) => (
                              <option key={step} value={step}>
                                Drip {step}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => handleSend(user)}
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
                            'Send'
                          )}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
