'use client'

import React, { useState } from 'react'

// ── Template definitions with their required fields ──────────────────

interface TemplateField {
  key: string
  label: string
  placeholder: string
  type?: 'text' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
}

interface TemplateDef {
  type: string
  label: string
  description: string
  fields: TemplateField[]
}

const TEMPLATES: TemplateDef[] = [
  {
    type: 'application_confirmation',
    label: 'Application Confirmation',
    description: 'Sent to a seeker after they apply to a job',
    fields: [
      { key: 'job_title', label: 'Job Title', placeholder: 'e.g. Front Desk Agent' },
      { key: 'company_name', label: 'Company Name', placeholder: 'e.g. Sandals Antigua' },
    ],
  },
  {
    type: 'new_applicant',
    label: 'New Applicant',
    description: 'Sent to an employer when someone applies',
    fields: [
      { key: 'applicant_name', label: 'Applicant Name', placeholder: 'e.g. John Smith' },
      { key: 'job_title', label: 'Job Title', placeholder: 'e.g. Chef' },
    ],
  },
  {
    type: 'status_update',
    label: 'Application Status Update',
    description: 'Sent to a seeker when their application status changes',
    fields: [
      { key: 'job_title', label: 'Job Title', placeholder: 'e.g. Accountant' },
      { key: 'company_name', label: 'Company Name', placeholder: 'e.g. ABST' },
      { key: 'status', label: 'Status', placeholder: '', type: 'select', options: [
        { value: 'interview', label: 'Interview' },
        { value: 'rejected', label: 'Not Selected' },
        { value: 'hold', label: 'On Hold' },
      ]},
    ],
  },
  {
    type: 'listing_approved',
    label: 'Listing Approved',
    description: 'Sent to an employer when their job is approved',
    fields: [
      { key: 'listing_title', label: 'Listing Title', placeholder: 'e.g. Security Guard' },
    ],
  },
  {
    type: 'listing_rejected',
    label: 'Listing Rejected',
    description: 'Sent to an employer when their job is rejected',
    fields: [
      { key: 'listing_title', label: 'Listing Title', placeholder: 'e.g. Security Guard' },
      { key: 'rejection_reason', label: 'Rejection Reason', placeholder: 'e.g. Missing job description', type: 'textarea' },
    ],
  },
  {
    type: 'listing_expiry',
    label: 'Listing Expiry Warning',
    description: 'Sent to an employer when their listing is about to expire',
    fields: [
      { key: 'listing_title', label: 'Listing Title', placeholder: 'e.g. Bartender' },
      { key: 'expires_at', label: 'Expires At', placeholder: 'e.g. March 30, 2026' },
    ],
  },
  {
    type: 'new_message',
    label: 'New Message',
    description: 'Sent when a user receives a new message',
    fields: [
      { key: 'sender_name', label: 'Sender Name', placeholder: 'e.g. Jane Doe' },
      { key: 'job_title', label: 'Job Title', placeholder: 'e.g. Server' },
      { key: 'message_preview', label: 'Message Preview', placeholder: 'e.g. Hi, I wanted to follow up...', type: 'textarea' },
    ],
  },
  {
    type: 'report_response',
    label: 'Report Response',
    description: 'Admin response to a user who reported a listing',
    fields: [
      { key: 'job_title', label: 'Job Title', placeholder: 'e.g. Suspicious Listing' },
      { key: 'admin_message', label: 'Admin Message', placeholder: 'e.g. We have reviewed and removed the listing.', type: 'textarea' },
    ],
  },
  {
    type: 'job_invite',
    label: 'Job Invite',
    description: 'Sent to a seeker when an employer invites them to apply',
    fields: [
      { key: 'company_name', label: 'Company Name', placeholder: 'e.g. Jumby Bay Resort' },
      { key: 'job_title', label: 'Job Title', placeholder: 'e.g. Concierge' },
      { key: 'message_preview', label: 'Invitation Message', placeholder: 'e.g. We think you would be a great fit!', type: 'textarea' },
      { key: 'listing_url', label: 'Listing URL (optional)', placeholder: 'e.g. /jobs/abc-123' },
    ],
  },
  {
    type: 'new_job_posted',
    label: 'New Job Posted',
    description: 'Sent to seekers when a new job is posted',
    fields: [
      { key: 'seeker_name', label: 'Seeker Name', placeholder: 'e.g. Marcus' },
      { key: 'job_title', label: 'Job Title', placeholder: 'e.g. Receptionist' },
      { key: 'company_name', label: 'Company Name', placeholder: 'e.g. Sandals' },
      { key: 'job_location', label: 'Location', placeholder: 'e.g. St. John\'s' },
      { key: 'job_type_label', label: 'Job Type', placeholder: 'e.g. Full Time' },
      { key: 'salary_range', label: 'Salary Range (optional)', placeholder: 'e.g. EC$2k – EC$3k' },
      { key: 'job_description_preview', label: 'Description Preview', placeholder: 'First 200 characters...', type: 'textarea' },
      { key: 'listing_url', label: 'Listing URL', placeholder: 'e.g. https://joblinkantigua.com/jobs/abc' },
    ],
  },
  {
    type: 'resume_nudge',
    label: 'Resume Nudge (1st)',
    description: 'First reminder for seekers who haven\'t uploaded a resume',
    fields: [
      { key: 'applicant_name', label: 'Seeker Name', placeholder: 'e.g. Sarah' },
    ],
  },
  {
    type: 'resume_nudge_2',
    label: 'Resume Nudge (2nd)',
    description: 'Second reminder for seekers who still haven\'t uploaded a resume',
    fields: [
      { key: 'applicant_name', label: 'Seeker Name', placeholder: 'e.g. Sarah' },
    ],
  },
  {
    type: 'resume_importance',
    label: 'Resume Importance (Campaign)',
    description: 'Campaign email emphasizing why a resume is essential for being found by employers',
    fields: [
      { key: 'applicant_name', label: 'Seeker Name', placeholder: 'e.g. Sarah' },
    ],
  },
  {
    type: 'signup_reminder_1',
    label: 'Signup Reminder (1st)',
    description: 'First reminder for users who haven\'t verified their email',
    fields: [],
  },
  {
    type: 'signup_reminder_2',
    label: 'Signup Reminder (2nd)',
    description: 'Second reminder for unverified users',
    fields: [],
  },
  {
    type: 'signup_reminder_3',
    label: 'Signup Reminder (Final)',
    description: 'Final reminder for unverified users',
    fields: [],
  },
]

// ── Job Notification Blast ───────────────────────────────────────────

interface ActiveJob {
  id: string
  title: string
  company_name: string
  created_at: string
}

export function JobNotificationBlast({ jobs }: { jobs: ActiveJob[] }) {
  const [selectedJobId, setSelectedJobId] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; title: string } | null>(null)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!selectedJobId) return
    setSending(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/admin/emails/notify-seekers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: selectedJobId }),
      })
      if (res.ok) {
        const data = await res.json()
        setResult({ sent: data.sent, title: data.job_title })
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to send')
      }
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-white p-6">
      <h3 className="text-sm font-semibold text-text">Re-send Job Notification</h3>
      <p className="text-xs text-text-muted mt-1">
        Blast the &quot;new job posted&quot; email to all verified seekers for a specific job listing.
      </p>

      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <select
          value={selectedJobId}
          onChange={(e) => { setSelectedJobId(e.target.value); setResult(null); setError('') }}
          className="flex-1 rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        >
          <option value="">Select a job listing...</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} — {job.company_name}
            </option>
          ))}
        </select>

        <button
          onClick={handleSend}
          disabled={!selectedJobId || sending || result !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {sending ? (
            <>
              <Spinner />
              Sending...
            </>
          ) : result ? (
            <>
              <CheckIcon />
              {result.sent} emails sent
            </>
          ) : (
            'Send to All Seekers'
          )}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}

// ── Resume Importance Blast ──────────────────────────────────────────

export function ResumeImportanceBlast() {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null)
  const [error, setError] = useState('')

  async function handleSend() {
    setSending(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/admin/emails/resume-blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setResult({ sent: data.sent, skipped: data.skipped })
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to send')
      }
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-white p-6">
      <h3 className="text-sm font-semibold text-text">Resume Importance Campaign</h3>
      <p className="text-xs text-text-muted mt-1">
        Send the resume importance email to all verified seekers who don&apos;t have a resume (uploaded or built).
      </p>

      <div className="mt-4 flex flex-col sm:flex-row gap-3 items-start">
        <button
          onClick={handleSend}
          disabled={sending || result !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {sending ? (
            <>
              <Spinner />
              Sending...
            </>
          ) : result ? (
            <>
              <CheckIcon />
              {result.sent} sent, {result.skipped} skipped (have resume)
            </>
          ) : (
            'Send to All Seekers Without Resume'
          )}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}

// ── Template Sender ──────────────────────────────────────────────────

export function TemplateSender() {
  const [selectedType, setSelectedType] = useState('')
  const [toEmail, setToEmail] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const template = TEMPLATES.find((t) => t.type === selectedType)

  function handleTemplateChange(type: string) {
    setSelectedType(type)
    setFieldValues({})
    setSent(false)
    setError('')
  }

  function updateField(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSend() {
    if (!selectedType || !toEmail) return
    setSending(true)
    setError('')
    setSent(false)
    try {
      const res = await fetch('/api/admin/emails/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toEmail,
          type: selectedType,
          data: fieldValues,
        }),
      })
      if (res.ok) {
        setSent(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to send')
      }
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-white p-6">
      <h3 className="text-sm font-semibold text-text">Send Any Template</h3>
      <p className="text-xs text-text-muted mt-1">
        Select an email template, fill in the fields, and send it to any email address.
      </p>

      <div className="mt-4 space-y-4">
        {/* Template selector */}
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
            Template
          </label>
          <select
            value={selectedType}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="">Select a template...</option>
            {TEMPLATES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {template && (
          <>
            {/* Template description */}
            <div className="rounded-xl bg-bg-alt/50 border border-border/30 px-4 py-3">
              <p className="text-xs text-text-muted">{template.description}</p>
            </div>

            {/* Recipient */}
            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                Send To
              </label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => { setToEmail(e.target.value); setSent(false) }}
                placeholder="recipient@example.com"
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-text-muted/60"
              />
            </div>

            {/* Dynamic fields */}
            {template.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                  {field.label}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={fieldValues[field.key] || ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 resize-none placeholder:text-text-muted/60"
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={fieldValues[field.key] || ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={fieldValues[field.key] || ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-text-muted/60"
                  />
                )}
              </div>
            ))}

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!toEmail || sending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <>
                  <Spinner />
                  Sending...
                </>
              ) : sent ? (
                <>
                  <CheckIcon />
                  Sent!
                </>
              ) : (
                'Send Email'
              )}
            </button>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Shared icons ─────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
