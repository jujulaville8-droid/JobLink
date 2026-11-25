'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ShieldCheckIcon } from '@/components/verification/VerifiedBadge'
import { useVerifiedEnabled } from '@/components/verification/VerifiedFlag'
import { BADGE_ELIGIBLE, BADGE_PERMIT } from '@/lib/verification/shared'

export interface ApplyVerifiedContext {
  verified: boolean
  holdsWorkPermit: boolean
  priorApplications: number
  canGetVerified: boolean
}

/**
 * The Verified part of the apply form. A verified job seeker can tick "Send my
 * right-to-work confirmation" (ticked by default; the tick is the consent for
 * this share). Everyone else sees nothing here: applying works exactly the same.
 */
export default function ApplyVerifiedDocuments({ jobId, disabled, onChoice, onContext }: {
  jobId: string
  disabled?: boolean
  onChoice: (send: boolean) => void
  onContext?: (context: ApplyVerifiedContext) => void
}) {
  const enabled = useVerifiedEnabled()
  const [context, setContext] = useState<ApplyVerifiedContext | null>(null)
  const [send, setSend] = useState(true)

  useEffect(() => {
    if (!enabled) return
    let live = true
    fetch(`/api/verification/apply-context?job_id=${encodeURIComponent(jobId)}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ApplyVerifiedContext | null) => {
        if (!live || !data) return
        setContext(data)
        onContext?.(data)
        if (data.verified) onChoice(true)
      })
      .catch(() => { /* Verified is an extra; the application form works without it. */ })
    return () => { live = false }
    // Loaded once per job; the callbacks are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, enabled])

  if (!context?.verified) return null
  return (
    <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <input type="checkbox" className="mt-0.5 h-4 w-4" disabled={disabled} checked={send}
        onChange={(event) => { setSend(event.target.checked); onChoice(event.target.checked) }} />
      <span className="text-sm text-text">
        <span className="flex items-center gap-1.5 font-semibold text-emerald-900"><ShieldCheckIcon className="h-4 w-4" /> Send my right-to-work confirmation</span>
        <span className="mt-1 block text-xs leading-relaxed text-text-muted">
          This employer sees &ldquo;{context.holdsWorkPermit ? BADGE_PERMIT : BADGE_ELIGIBLE}&rdquo; and a confirmation written by JobLink. It never shows your ID number or photo. <Link href="/verification" className="underline">See it</Link>
        </span>
      </span>
    </label>
  )
}
