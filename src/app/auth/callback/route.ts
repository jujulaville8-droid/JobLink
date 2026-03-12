import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const signupRole = searchParams.get('role')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Always determine role from the database, never from URL parameters
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        // Use DB role if it exists; for brand-new users the trigger sets the role
        // from raw_user_meta_data, so fall back to a safe default
        const userRole = userData?.role ?? (signupRole === 'employer' ? 'employer' : 'seeker')

        // Sync role to user metadata for downstream detection
        const currentMetaRole = user.user_metadata?.role
        if (currentMetaRole !== userRole) {
          await supabase.auth.updateUser({
            data: { role: userRole },
          })
        }
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
