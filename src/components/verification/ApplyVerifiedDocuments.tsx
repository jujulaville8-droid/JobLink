'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ShieldCheckIcon } from '@/components/verification/VerifiedBadge'
import { useVerifiedEnabled } from '@/components/verification/VerifiedFlag'

export interface ApplyVerifiedContext {
  verified: boolean
  notice: boolean
  holdsWorkPermit: boolean
  policeRecordRequired: boolean
  priorApplications: number
  canBuy: boolean
}
export interface VerifiedChoice { police_record: boolean; right_to_work: boolean }

/**
 * The Verified part of the apply form.
 *
 * Verified job seekers get "Send my verified documents" with two ticks. They
 * start ticked only on jobs marked "Police record required", and never when
 * the reviewer left a notice to read first. Each tick is the consent for that
 * share. Unverified job seekers see one line, and only on jobs that ask for a
 * police record. Applying works exactly the same either way.
 */
export default function ApplyVerifiedDocuments({ jobId, disabled, onChoice, onContext }: {
  jobId: string
  disabled?: boolean
  onChoice: (choice: VerifiedChoice | null) => void
  onContext?: (context: ApplyVerifiedContext) => void
}) {
  const enabled = useVerifiedEnabled()
  const [context, setContext] = useState<ApplyVerifiedContext | null>(null)
  const [choice, setChoice] = useState<VerifiedChoice>({ police_record: false, right_to_work: false })

  useEffect(() => {
    if (!enabled) return
    let live = true
    fetch(`/api/verification/apply-context?job_id=${encodeURIComponent(jobId)}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ApplyVerifiedContext | null) => {
        if (!live || !data) return
        setContext(data)
        onContext?.(data)
        if (data.verified) {
          const ticked = data.policeRecordRequired && !data.notice
          const initial = { police_record: ticked, right_to_work: ticked }
          setChoice(initial)
          onChoice(initial)
        }
      })
      .catch(() => { /* Verified is an extra; the application form works without it. */ })
    return () => { live = false }
    // Loaded once per job; the callbacks are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, enabled])

  if (!context) return null

  if (!context.verified) {
    if (!context.policeRecordRequired || !context.canBuy) return null
    return (
      <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-bg-alt/60 p-3.5 text-xs leading-relaxed text-text-muted">
        <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>This employer asks for a police record. <Link href="/verified" className="font-semibold text-primary underline">Have your police record checked once and send it with every application.</Link> Optional. You can apply now without it.</span>
      </p>
    )
  }

  const update = (key: keyof VerifiedChoice, value: boolean) => {
    const next = { ...choice, [key]: value }
    setChoice(next)
    onChoice(next)
  }

  return (
    <fieldset className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-emerald-900"><ShieldCheckIcon className="h-4 w-4" /> Send my verified documents</legend>
      {context.notice && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <strong>Please read first.</strong> Our reviewer left a note about your police record. <Link href="/verification" className="font-semibold underline">Read it and preview what employers see</Link> before you send it. Sending it is always your choice.
        </p>
      )}
      <p className="text-xs leading-relaxed text-emerald-900/80">Send my verified police record and proof I can work locally{context.policeRecordRequired ? '. This employer asks for a police record.' : '.'}</p>
      <div className="mt-3 space-y-2">
        <label className="flex items-start gap-3 text-sm text-text">
          <input type="checkbox" className="mt-0.5 h-4 w-4" disabled={disabled} checked={choice.police_record} onChange={(event) => update('police_record', event.target.checked)} />
          <span><span className="font-medium">Police record</span><span className="block text-xs text-text-muted">The stamped copy, opened on JobLink after the employer logs in. Never emailed.</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm text-text">
          <input type="checkbox" className="mt-0.5 h-4 w-4" disabled={disabled} checked={choice.right_to_work} onChange={(event) => update('right_to_work', event.target.checked)} />
          <span><span className="font-medium">Right to work</span><span className="block text-xs text-text-muted">A confirmation written by JobLink. It never shows your ID number or photo.{context.holdsWorkPermit ? ' It says a new employer would need to apply for a permit.' : ''}</span></span>
        </label>
      </div>
      <p className="mt-3 text-xs text-text-muted">Only this employer can open them. You can see when they do and stop sharing at any time. <Link href="/verification" className="underline">Preview what they see</Link></p>
    </fieldset>
  )
}
