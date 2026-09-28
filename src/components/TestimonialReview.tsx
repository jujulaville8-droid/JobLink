'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TestimonialReview({ id, updatedAt, eligible }: { id: string; updatedAt: string; eligible: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function review(status: 'approved' | 'rejected') {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, updated_at: updatedAt }) })
      if (!res.ok) setError((await res.json()).error)
      else router.refresh()
    } catch { setError('Could not save. Please try again.') } finally { setBusy(false) }
  }
  return <div className="mt-4 flex flex-wrap items-center gap-3">
    <button className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-40" disabled={busy || !eligible} onClick={() => review('approved')}>Approve for site & outreach</button>
    <button className="rounded-lg border px-4 py-2" disabled={busy} onClick={() => review('rejected')}>Keep private / remove</button>
    <span role="status" className="text-sm text-red-700">{error}</span>
  </div>
}
