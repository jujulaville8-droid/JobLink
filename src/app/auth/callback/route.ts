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
      const { data: { user } } = await supabase.auth.getUser()

      // Determine the user's role
      let userRole = role
      if (!userRole && user) {
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()
        userRole = userData?.role ?? user.user_metadata?.role ?? 'seeker'
      }

      // Ensure role is always synced to user metadata for reliable downstream detection
      if (user && userRole && (userRole === 'seeker' || userRole === 'employer')) {
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
