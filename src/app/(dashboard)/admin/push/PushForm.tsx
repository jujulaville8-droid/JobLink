'use client'

import React, { useState } from 'react'

const LABEL_CLASS = 'block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5'
const INPUT_CLASS =
  'w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-text-muted/60'

export default function PushForm({ initialDevices }: { initialDevices: number | null }) {
  const [devices, setDevices] = useState(initialDevices)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [jobId, setJobId] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  // Sends can prune dead tokens. A failed refresh just leaves the old count up.
  async function refreshDevices() {
    try {
      const res = await fetch('/api/admin/push')
      if (!res.ok) return
      const data = await res.json()
      if (typeof data.devices === 'number') setDevices(data.devices)
    } catch {
      // The send itself succeeded, so there is nothing to report.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    if (!window.confirm('Send this notification to all registered devices?')) return

    setSending(true)
    setResult('')
    setError('')

    const trimmedJobId = jobId.trim()

    try {
      const res = await fetch('/api/admin/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, ...(trimmedJobId ? { jobId: trimmedJobId } : {}) }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data) {
        setError(data?.error || 'Failed to send')
        return
      }

      setResult(`Sent: ${data.sent}. Failed: ${data.failed}.`)
      setTitle('')
      setBody('')
      setJobId('')
      await refreshDevices()
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-white p-6">
      <p className="text-sm text-text">
        Registered devices:{' '}
        <span className="font-semibold">
          {devices === null ? 'unavailable' : devices.toLocaleString()}
        </span>
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="push-title" className={LABEL_CLASS}>
            Notification title
          </label>
          <input
            id="push-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="push-body" className={LABEL_CLASS}>
            Message
          </label>
          <textarea
            id="push-body"
            required
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`${INPUT_CLASS} resize-none`}
          />
        </div>

        <div>
          <label htmlFor="push-job-id" className={LABEL_CLASS}>
            Job ID (optional)
          </label>
          <input
            id="push-job-id"
            type="text"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <button
          type="submit"
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>

        {result && <p className="text-sm text-text">{result}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  )
}
