import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Verifies a request is from an authenticated, email-verified user.
 * Returns { user, supabase } on success, or a NextResponse error.
 */
export async function requireVerifiedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    }
  }

  if (!user.email_confirmed_at) {
    return {
      error: NextResponse.json(
        { error: 'Please verify your email first' },
        { status: 403 }
      ),
    }
  }

  // Also check the database flag
  const { data: userData } = await supabase
    .from('users')
    .select('email_verified')
    .eq('id', user.id)
    .single()

  if (!userData || userData.email_verified !== true) {
    return {
      error: NextResponse.json(
        { error: 'Please verify your email first' },
        { status: 403 }
      ),
    }
  }

  return { user, supabase }
}
