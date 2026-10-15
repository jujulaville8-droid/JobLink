import type { SupabaseClient, User } from '@supabase/supabase-js'
import { queueVerifiedSignupAlert, type SignupAlertScheduler, type VerifiedSignupAccount } from '@/lib/signup-notifications'

const accountFields = 'id, role, email_verified, is_admin, is_banned, created_at'

/** Shared by password verification and Google callbacks; no new DB grants. */
export async function syncAccountVerification(admin: SupabaseClient, user: User, fallbackRole: string, schedule?: SignupAlertScheduler) {
  if (!user.email_confirmed_at) return { role: fallbackRole, error: true }
  const { data: existing, error: readError } = await admin.from('users').select(accountFields).eq('id', user.id).single()
  if (readError && readError.code !== 'PGRST116') return { role: fallbackRole, error: true }
  const role = existing?.role || fallbackRole
  let newlyVerified: VerifiedSignupAccount | undefined
  if (existing) {
    if (existing.email_verified === true) return { role, error: false }
    // Compare-and-set in Postgres: simultaneous callbacks have one winner.
    // Only that winner receives a row and can schedule a notification.
    const { data, error } = await admin.from('users')
      .update({ email_verified: true }).eq('id', user.id).eq('email_verified', false).select(accountFields)
    if (error) return { role, error: true }
    newlyVerified = data?.[0]
  } else {
    const { data, error } = await admin.from('users').insert({
      id: user.id, email: user.email!, role, email_verified: true,
    }).select(accountFields).single()
    if (error?.code === '23505') {
      // Another callback created this row. It owns the notification attempt.
      const raced = await admin.from('users').select('role, email_verified').eq('id', user.id).single()
      return { role: raced.data?.role || role, error: !!raced.error || raced.data?.email_verified !== true }
    }
    if (error) return { role, error: true }
    newlyVerified = data
  }
  if (newlyVerified) queueVerifiedSignupAlert(user, newlyVerified, schedule)
  return { role, error: false }
}
