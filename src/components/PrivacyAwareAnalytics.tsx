'use client'

import { Analytics } from '@vercel/analytics/next'

// Claim links are bearer credentials, including while carried through signup.
// Do not send their path/query to analytics. Referrer-Policy handles navigation.
export function containsClaimCredential(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://joblinkantigua.com')
    return parsed.pathname.startsWith('/claim/') || parsed.pathname.startsWith('/api/claim/') ||
      parsed.searchParams.get('returnTo')?.startsWith('/claim/') === true
  } catch { return true }
}

export default function PrivacyAwareAnalytics() {
  return <Analytics beforeSend={event => containsClaimCredential(event.url) ? null : event} />
}
