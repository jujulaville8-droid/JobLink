/**
 * Shared auth-state model for the client.
 *
 * Server-side verification checks live in `src/lib/api-auth.ts`
 * (`requireUser` / `requireVerifiedUser` / `requireAdmin`) and in
 * `src/lib/supabase/middleware.ts`. This module only describes the state the
 * UI renders from.
 *
 * Verification has two sources: `user.email_confirmed_at` from Supabase Auth
 * is the source of truth, and `public.users.email_verified` is synchronised on
 * the verification callback. Both must be true for an ordinary account.
 */

export type AuthStatus =
  | 'anonymous'
  | 'authenticating'
  | 'authenticated_unverified'
  | 'authenticated_verified'

export function getAuthStatus(
  user: unknown | null,
  isLoading: boolean,
  isVerified: boolean
): AuthStatus {
  if (isLoading) return 'authenticating'
  if (!user) return 'anonymous'
  if (!isVerified) return 'authenticated_unverified'
  return 'authenticated_verified'
}
