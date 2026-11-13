'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import VerifiedBadge from '@/components/verification/VerifiedBadge'
import { useVerifiedEnabled } from '@/components/verification/VerifiedFlag'
import type { BadgeInfo } from '@/lib/verification/shared'

/** The job seeker's own badge beside their name, with a link to manage documents. Renders nothing unless they hold a valid badge. */
export default function ProfileVerifiedBadge() {
  const enabled = useVerifiedEnabled()
  const [badge, setBadge] = useState<BadgeInfo | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetch('/api/verification', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (live && data?.badge?.valid && data.badge.reviewed_at) {
          setBadge({ holdsWorkPermit: data.badge.rtw_group === 'work_permit', checkedOn: data.badge.reviewed_at })
        }
      })
      .catch(() => { /* The badge is an extra; the profile works without it. */ })
    return () => { live = false }
  }, [enabled])
  if (!badge) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <VerifiedBadge badge={badge} />
      <Link href="/verification" className="text-xs font-semibold text-primary underline">Manage documents</Link>
    </div>
  )
}
