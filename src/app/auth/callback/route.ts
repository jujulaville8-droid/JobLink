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

      let userRole = signupRole === 'employer' ? 'employer' : 'seeker'

      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        userRole = userData?.role ?? userRole

        const currentMetaRole = user.user_metadata?.role
        if (currentMetaRole !== userRole) {
          await supabase.auth.updateUser({
            data: { role: userRole },
          })
        }
      }

      const returnTo = searchParams.get('returnTo')
      const dest = returnTo && returnTo.startsWith('/')
        ? returnTo
        : userRole === 'admin' ? '/dashboard'
        : userRole === 'employer' ? '/post-job' : '/jobs'
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
