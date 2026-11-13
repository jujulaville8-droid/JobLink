import { badgeText, type BadgeInfo } from '@/lib/verification/shared'

export function ShieldCheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

/**
 * The JobLink Verified badge. The wording comes from one place (badgeText) and
 * only ever says which documents were checked and when.
 *
 * compact: just "Verified" with the full wording as the accessible name and tooltip.
 */
export default function VerifiedBadge({ badge, compact = false, className = '' }: { badge: BadgeInfo; compact?: boolean; className?: string }) {
  const text = badgeText(badge)
  if (compact) {
    return (
      <span title={text} className={`inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ${className}`}>
        <ShieldCheckIcon className="h-3.5 w-3.5" />
        <span aria-hidden="true">Verified</span>
        <span className="sr-only">JobLink Verified: {text}</span>
      </span>
    )
  }
  return (
    <span className={`inline-flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium leading-snug text-emerald-900 ${className}`}>
      <ShieldCheckIcon className="mt-px h-4 w-4 shrink-0" />
      <span><span className="sr-only">JobLink Verified: </span>{text}</span>
    </span>
  )
}

/** The label on listings whose employer ticked "Police record required". */
export function PoliceRecordRequiredLabel({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-border bg-bg-alt px-2.5 py-1 text-xs font-medium text-text ${className}`}>
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><polyline points="9 15 11 17 15 13" />
      </svg>
      Police record required
    </span>
  )
}
