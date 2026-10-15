'use client'

import { useState } from 'react'
import { antiguaDate, parseClosesAfter } from '@/lib/job-closures'

interface EditableJob {
  id: string
  title: string
  description: string
  category: string
  job_type: string
  location: string
  closes_after: string
}

const inputClass = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm'

export default function EditJobForm({ job, categories, jobTypes }: {
  job: EditableJob
  categories: string[]
  jobTypes: Record<string, string>
}) {
  const [values, setValues] = useState(job)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (key: keyof EditableJob) => (event: { target: { value: string } }) =>
    setValues(current => ({ ...current, [key]: event.target.value }))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    const changes: Record<string, string | null> = Object.fromEntries(
      (['title', 'description', 'category', 'job_type', 'location'] as const)
        .filter(key => values[key] !== job[key])
        .map(key => [key, values[key]]),
    )
    if (values.closes_after !== job.closes_after) {
      const deadline = parseClosesAfter(values.closes_after)
      if (!deadline.ok) {
        setSaving(false)
        setMessage({ ok: false, text: deadline.error })
        return
      }
      changes.closes_after = deadline.value
    }
    if (!Object.keys(changes).length) {
      setSaving(false)
      setMessage({ ok: true, text: 'No changes to save.' })
      return
    }
    const res = await fetch(`/api/admin/listings/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    setMessage(res.ok ? { ok: true, text: 'Saved. The public job page now shows these changes.' } : { ok: false, text: data.error || 'Save failed.' })
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <label className="block text-sm font-medium">Title
        <input className={inputClass} value={values.title} onChange={set('title')} required />
      </label>
      <label className="block text-sm font-medium">Location
        <input className={inputClass} value={values.location} onChange={set('location')} required />
      </label>
      <label className="block text-sm font-medium">Category
        <select className={inputClass} value={values.category} onChange={set('category')}>
          {!categories.includes(values.category) && <option value={values.category}>{values.category || '—'}</option>}
          {categories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Job type
        <select className={inputClass} value={values.job_type} onChange={set('job_type')}>
          {Object.entries(jobTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Application deadline <span className="font-normal text-text-muted">(optional)</span>
        <input type="date" className={inputClass} value={values.closes_after} min={antiguaDate()} onChange={set('closes_after')} />
        <span className="mt-1 block text-xs font-normal text-text-muted">Shown as &ldquo;Apply by&rdquo;; the job closes automatically after this date (Antigua time). Clear to remove.</span>
      </label>
      <label className="block text-sm font-medium">Description
        <textarea className={`${inputClass} min-h-[320px]`} value={values.description} onChange={set('description')} required />
      </label>
      {message && <p role="status" className={message.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-600'}>{message.text}</p>}
      <button type="submit" disabled={saving} className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-60">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
