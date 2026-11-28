'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { ShieldCheckIcon } from '@/components/verification/VerifiedBadge'

const KEY = 'joblink:verified-card-dismissed'
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/**
 * One line of status and a link to /verification. Sits below the dashboard
 * header, never in front of the free path to a job. Stays hidden once
 * dismissed, unless the badge is expiring (dismissible=false).
 */
export default function VerifiedDashboardCard({ line, cta, dismissible }: { line: string; cta: string; dismissible: boolean }) {
  // Hidden on the server render when dismissible, so a dismissed card never flashes.
  const dismissed = useSyncExternalStore(subscribe, read, () => true)
  if (dismissible && dismissed) return null
  return (
    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-white p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><ShieldCheckIcon className="h-5 w-5" /></span>
      <p className="min-w-0 flex-1 text-sm text-text">{line}</p>
      <Link href="/verification" className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white">{cta}</Link>
      {dismissible && (
        <button type="button" aria-label="Hide this card" className="shrink-0 rounded-full p-1.5 text-text-muted hover:bg-bg-alt"
          onClick={() => { try { localStorage.setItem(KEY, '1') } catch { /* private mode */ } listeners.forEach((listener) => listener()) }}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      )}
    </div>
  )
}
