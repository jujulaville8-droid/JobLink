'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { enquiryStatuses, statusLabels } from '@/lib/employer-pilot'

export default function EmployerEnquiryReview({ id, initialStatus, initialNotes, listingId, updatedAt }: {
  id: string; initialStatus: string; initialNotes: string; listingId: string | null; updatedAt: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [notes, setNotes] = useState(initialNotes)
  const [listing, setListing] = useState(listingId ? `https://joblinkantigua.com/jobs/${listingId}` : '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <form className="mt-5 space-y-4 border-t pt-5" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage('')
    const linkedId = listing.trim().replace(/^https:\/\/(?:www\.)?joblinkantigua\.com\/jobs\//, '').replace(/\/$/, '')
    try {
      const res = await fetch(`/api/admin/employer-enquiries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, notes, listing_id: linkedId || null, updated_at: updatedAt }) })
      const body = await res.json()
      if (!res.ok) setMessage(body.error)
      else { setMessage('Saved'); router.refresh() }
    } catch { setMessage('Could not save. Please try again.') } finally { setBusy(false) }
  }}>
    <label className="block text-sm font-medium">Progress<select className="mt-1 block w-full rounded-lg border p-3" value={status} onChange={e => setStatus(e.target.value)}>{enquiryStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
    <label className="block text-sm font-medium">Private follow-up notes<textarea className="mt-1 block min-h-24 w-full rounded-lg border p-3" value={notes} onChange={e => setNotes(e.target.value)} maxLength={6000} placeholder="Contact attempts, agreed requirements, permission to publish, next action…" /></label>
    <label className="block text-sm font-medium">Published JobLinks URL or listing ID<input className="mt-1 block w-full rounded-lg border p-3" value={listing} onChange={e => setListing(e.target.value)} placeholder="https://joblinkantigua.com/jobs/…" /></label>
    <button disabled={busy} className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save progress'}</button><span className="ml-3 text-sm" role="status">{message}</span>
  </form>
}
