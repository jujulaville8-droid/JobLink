import { after } from 'next/server'
import type { User } from '@supabase/supabase-js'

export interface VerifiedSignupAccount {
  id: string
  role: string
  email_verified: boolean
  is_admin: boolean
  is_banned: boolean
  created_at: string
}
export type SignupAlertScheduler = (work: () => Promise<void>) => void

/** Server routes only. The topic is a bearer secret, never a public env value. */
export function queueVerifiedSignupAlert(user: User, account: VerifiedSignupAccount, schedule: SignupAlertScheduler = after) {
  if (process.env.VERCEL_ENV !== 'production' || process.env.NTFY_SIGNUP_ALERTS_ENABLED !== 'true') return
  const topic = process.env.NTFY_SIGNUP_TOPIC
  const since = process.env.NTFY_SIGNUP_ALERTS_SINCE
  if (!topic || !/^[A-Za-z0-9_-]{32,64}$/.test(topic) || !since || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(since)) return
  const cutoff = Date.parse(since)
  const authCreated = Date.parse(user.created_at)
  const accountCreated = Date.parse(account.created_at)
  if (![cutoff, authCreated, accountCreated].every(Number.isFinite) || authCreated < cutoff || accountCreated < cutoff) return
  if (account.id !== user.id || !user.email_confirmed_at || !account.email_verified || account.is_admin !== false || account.is_banned !== false) return
  if (account.role !== 'seeker' && account.role !== 'employer') return
  if (user.app_metadata?.provider !== 'email' && user.app_metadata?.provider !== 'google') return
  if (/^admin-company-/i.test(user.email || '')) return
  for (const metadata of [user.app_metadata, user.user_metadata]) {
    if (metadata?.admin_created || metadata?.imported || metadata?.import_source || metadata?.source === 'import') return
  }
  const role = account.role === 'seeker' ? 'jobseeker' : 'employer'
  // Capture only the fixed destination and generic role, never user data.
  try {
    schedule(async () => {
      try {
        const response = await fetch(`https://ntfy.sh/${topic}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: 'JobLink new signup', Priority: 'default' },
          body: `1 new ${role} account verified on JobLink.`,
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) {
          console.error('[signup-alert] Provider rejected notification', { status: response.status })
          return
        }
        const acknowledgement = await response.json()
        if (acknowledgement?.event !== 'message' || typeof acknowledgement.id !== 'string' || !acknowledgement.id || acknowledgement.id.length > 128) {
          console.error('[signup-alert] Provider acknowledgement unavailable; delivery uncertain')
          return
        }
        console.log('[signup-alert] Provider accepted generic notification')
      } catch {
        // Never log raw fetch errors: they can contain the bearer topic URL.
        console.error('[signup-alert] Notification delivery uncertain; not retried')
      }
    })
  } catch {
    console.error('[signup-alert] Notification scheduling unavailable')
  }
}
