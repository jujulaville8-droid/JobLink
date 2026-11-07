'use client'

import { Analytics } from '@vercel/analytics/next'

// Claim and password reset links carry bearer credentials.
// Do not send their path/query to analytics. Referrer-Policy handles navigation.
export function isSensitiveUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://joblinkantigua.com')
    return parsed.pathname === '/auth/reset-confirm' || parsed.pathname.startsWith('/auth/reset-confirm/') ||
      parsed.pathname.startsWith('/claim/') || parsed.pathname.startsWith('/api/claim/') ||
      parsed.searchParams.get('returnTo')?.startsWith('/claim/') === true
  } catch { return true }
}

export default function PrivacyAwareAnalytics() {
  return <Analytics beforeSend={event => isSensitiveUrl(event.url) ? null : event} />
}
