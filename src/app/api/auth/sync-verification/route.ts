import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

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

    // Check if user row exists
    const { data: existingUser } = await admin
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .single()

    let finalRole = role

    if (existingUser) {
      finalRole = existingUser.role || role
      const { error: updateError } = await admin
        .from('users')
        .update({ email_verified: true })
        .eq('id', user.id)

      if (updateError) {
        console.error('[sync-verification] Update failed', updateError.message)
        return NextResponse.json({ error: 'Failed to sync verification' }, { status: 500 })
      }
    } else {
      // User row missing (trigger may have failed) — create it
      const { error: insertError } = await admin.from('users').insert({
        id: user.id,
        email: user.email!,
        role,
        email_verified: true,
      })

      if (insertError) {
        console.error('[sync-verification] Insert failed', insertError.message)
        return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 })
      }
    }

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
