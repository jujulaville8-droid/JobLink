import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export interface AuthContext {
  user: User
  supabase: SupabaseClient
  /** Server-managed admin flag. Persists across role switches. */
  isAdmin: boolean
}

export interface AuthFailure {
  error: NextResponse
}

export type AuthResult = AuthContext | AuthFailure

const unauthorized = (): AuthFailure => ({
  error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
})

const banned = (): AuthFailure => ({
  error: NextResponse.json(
    { error: 'This account has been suspended.', code: 'ACCOUNT_BANNED' },
    { status: 403 }
  ),
})

const unverified = (): AuthFailure => ({
  error: NextResponse.json(
    { error: 'Please verify your email first', code: 'EMAIL_UNVERIFIED' },
    { status: 403 }
  ),
})

/**
 * Authenticated and not banned.
 *
 * Use for read endpoints. Anything that writes should use
 * `requireVerifiedUser` instead.
 */
export async function requireUser(): Promise<AuthResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return unauthorized()

  // One read covers both the ban check and the admin flag.
  const { data: userData } = await supabase
    .from('users')
    .select('is_banned, is_admin')
    .eq('id', user.id)
    .single()

  if (userData?.is_banned === true) return banned()

  return { user, supabase, isAdmin: userData?.is_admin === true }
}

/**
 * Authenticated, not banned, and email-verified.
 *
 * Verification is checked at both the auth level (`email_confirmed_at`, the
 * source of truth) and the database level (`public.users.email_verified`,
 * synchronised on the verification callback).
 *
 * Admin accounts are exempt from the verification requirement so server-side
 * automation is not blocked by an inbox. `is_admin` is service-managed —
 * `/api/switch-role` refuses to grant it — so this is not a way in.
 */
export async function requireVerifiedUser(): Promise<AuthResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return unauthorized()

  const { data: userData } = await supabase
    .from('users')
    .select('email_verified, is_banned, is_admin')
    .eq('id', user.id)
    .single()

  if (userData?.is_banned === true) return banned()

  const isAdmin = userData?.is_admin === true
  if (isAdmin) return { user, supabase, isAdmin }

  if (!user.email_confirmed_at) return unverified()
  if (!userData || userData.email_verified !== true) return unverified()

  return { user, supabase, isAdmin }
}

const twoStepRequired = (): AuthFailure => ({
  error: NextResponse.json(
    { error: 'Two-step login is required for this action.', code: 'MFA_REQUIRED' },
    { status: 403 }
  ),
})

/**
 * Whether every admin route insists on two-step login.
 *
 * Starts off so the existing admins can enrol at /two-step before the door
 * closes behind them. Routes that touch verification documents never consult
 * this: they use `requireAdminTwoStep` and always insist.
 */
export const adminTwoStepEnforced = (): boolean => process.env.ADMIN_MFA_ENFORCED === 'true'

/**
 * True only when this session has passed a second factor (AAL2).
 *
 * Call after `auth.getUser()` on the same client, which has already validated
 * the access token this reads the assurance level from. Fails closed.
 */
export async function hasTwoStepSession(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    return !error && data?.currentLevel === 'aal2'
  } catch {
    return false
  }
}

async function requireAdminFlag(): Promise<AuthResult> {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth

  if (!auth.isAdmin) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden: admin access required' },
        { status: 403 }
      ),
    }
  }

  return auth
}

/**
 * Authenticated, not banned, and carrying the server-managed admin flag.
 * With ADMIN_MFA_ENFORCED=true the session must also have passed two-step login.
 *
 * Replaces the copy-pasted "fetch is_admin with the service-role client and
 * compare" block that was repeated across the admin routes.
 */
export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireAdminFlag()
  if ('error' in auth) return auth
  if (adminTwoStepEnforced() && !(await hasTwoStepSession(auth.supabase))) return twoStepRequired()
  return auth
}

/**
 * An admin whose session has passed two-step login, regardless of the rollout
 * switch. Every route that can open or decide on identity documents and police
 * records uses this.
 */
export async function requireAdminTwoStep(): Promise<AuthResult> {
  const auth = await requireAdminFlag()
  if ('error' in auth) return auth
  if (!(await hasTwoStepSession(auth.supabase))) return twoStepRequired()
  return auth
}
