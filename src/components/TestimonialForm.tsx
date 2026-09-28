'use client'

import { useState } from 'react'

export default function TestimonialForm({ id, initialFeedback, initialRating, initialConsent }: {
  id: string; initialFeedback: string; initialRating: number; initialConsent: boolean
}) {
  const [feedback, setFeedback] = useState(initialFeedback)
  const [rating, setRating] = useState(initialRating)
  const [consent, setConsent] = useState(initialConsent)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <form className="space-y-6" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const res = await fetch(`/api/testimonials/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback, rating, consent }) })
      const body = await res.json()
      setMessage(res.ok ? 'Thank you — your feedback is saved. You can update it or withdraw sharing permission here anytime.' : body.error)
    } catch { setMessage('Unable to save. Please try again.') } finally { setBusy(false) }
  }}>
    <label className="block font-medium">How was your hiring experience?
      <select className="mt-2 block w-full rounded-lg border p-3" value={rating} onChange={e => setRating(Number(e.target.value))} required>
        <option value={0} disabled>Choose a rating</option>
        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5{n === 5 ? ' — Excellent' : n === 1 ? ' — Poor' : ''}</option>)}
      </select>
    </label>
    <label className="block font-medium">Tell us what worked and what could be better
      <textarea className="mt-2 block min-h-36 w-full rounded-lg border p-3" value={feedback} onChange={e => setFeedback(e.target.value)} minLength={10} maxLength={600} required placeholder="One or two sentences about finding your new hire through JobLinks…" />
      <span className="text-sm font-normal text-text-light">{feedback.length}/600 characters. Please leave out candidate names and personal details.</span>
    </label>
    <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
      <span>JobLinks may share my feedback, or a short exact excerpt, with my company name and job title on its website and in outreach emails. This is optional. Uncheck and save to stop future reuse.</span>
    </label>
    <button disabled={busy} className="rounded-xl bg-primary px-6 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save feedback'}</button>
    <p role="status" className="text-sm">{message}</p>
  </form>
}
