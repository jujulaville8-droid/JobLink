import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Centralized email verification logic.
 *
 * Primary source of truth: `user.email_confirmed_at` from Supabase Auth.
 * Secondary check: `public.users.email_verified` (synchronized on verification callback).
 *
 * Both must be truthy for a user to be considered verified.
 */
export function isEmailConfirmedByAuth(user: User | null): boolean {
  if (!user) return false
  return !!user.email_confirmed_at
}

/**
 * Full verification check: auth-level + database-level.
 * Use this for access control decisions.
 */
export async function isEmailVerified(
  user: User | null,
  supabase: SupabaseClient
): Promise<boolean> {
  if (!user) return false
  if (!user.email_confirmed_at) return false

  const { data } = await supabase
    .from('users')
    .select('email_verified')
    .eq('id', user.id)
    .single()

  // If no row exists yet, treat as unverified
  if (!data) return false

  return data.email_verified === true
}

/**
 * Determines whether a user can access protected parts of the app.
 * Requires: authenticated + email verified.
 */
export async function canAccessApp(
  user: User | null,
  supabase: SupabaseClient
): Promise<boolean> {
  if (!user) return false
  return isEmailVerified(user, supabase)
}

/**
 * Auth state model for consistent state across the app.
 */
export type AuthStatus =
  | 'anonymous'
  | 'authenticating'
  | 'authenticated_unverified'
  | 'authenticated_verified'

export function getAuthStatus(
  user: User | null,
  isLoading: boolean,
  isVerified: boolean
): AuthStatus {
  if (isLoading) return 'authenticating'
  if (!user) return 'anonymous'
  if (!isVerified) return 'authenticated_unverified'
  return 'authenticated_verified'
}
