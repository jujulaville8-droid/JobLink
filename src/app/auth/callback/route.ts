import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const role = searchParams.get('role')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // If a role was passed (Google signup from the signup page), set it in user metadata
      if (role && (role === 'seeker' || role === 'employer')) {
        await supabase.auth.updateUser({
          data: { role },
        })
      }

      // Determine the user's role for redirect
      let userRole = role
      if (!userRole) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()
          userRole = userData?.role ?? user.user_metadata?.role ?? 'seeker'
        }
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
