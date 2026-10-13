import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncAccountVerification } from '@/lib/sync-account-verification'

/**
 * POST /api/auth/sync-verification
 *
 * Called after email verification succeeds at the auth level.
 * Uses the admin client to bypass RLS and set email_verified=true
 * in the public.users table.
 *
 * Returns the user's role so the caller can redirect appropriately.
 */
export async function POST() {
  try {
    // Deliberately NOT requireVerifiedUser: this route is what grants
    // verification, so requiring it would deadlock the callback. requireUser
    // still authenticates the caller and rejects banned accounts.
    const auth = await requireUser()
    if ('error' in auth) return auth.error
    const { user } = auth

    // Only sync if Supabase auth confirms the email is verified
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Email not confirmed at auth level' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const metadataRole = user.user_metadata?.role
    const role = metadataRole === 'employer' ? 'employer' : 'seeker'

    const synced = await syncAccountVerification(admin, user, role)
    if (synced.error) {
      console.error('[sync-verification] Account verification sync failed')
      return NextResponse.json({ error: 'Failed to sync verification' }, { status: 500 })
    }
    const finalRole = synced.role

    // Check if the user has created a profile yet
    let hasProfile = false
    if (finalRole === 'employer') {
      const { data: company } = await admin
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .single()
      hasProfile = !!company
    } else {
      const { data: seeker } = await admin
        .from('seeker_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
      hasProfile = !!seeker
    }

    return NextResponse.json({ role: finalRole, hasProfile })
  } catch (err) {
    console.error('[sync-verification] Unexpected error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
