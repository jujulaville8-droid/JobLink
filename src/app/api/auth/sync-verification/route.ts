import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
    // Verify the user is actually authenticated
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Only sync if Supabase auth confirms the email is verified
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Email not confirmed at auth level' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const role = (user.user_metadata?.role as string) || 'seeker'

    // Check if user row exists
    const { data: existingUser } = await admin
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .single()

    if (existingUser) {
      const { error: updateError } = await admin
        .from('users')
        .update({ email_verified: true })
        .eq('id', user.id)

      if (updateError) {
        console.error('[sync-verification] Update failed', updateError.message)
        return NextResponse.json({ error: 'Failed to sync verification' }, { status: 500 })
      }

      return NextResponse.json({ role: existingUser.role || role })
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

      return NextResponse.json({ role })
    }
  } catch (err) {
    console.error('[sync-verification] Unexpected error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
