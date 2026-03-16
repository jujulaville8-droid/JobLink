import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const signupRole = searchParams.get('role')

  console.log('[auth-callback] Received', {
    hasCode: !!code,
    signupRole,
    url: request.url,
  })

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[auth-callback] Code exchange failed', {
        error: error.message,
        status: error.status,
      })
      return NextResponse.redirect(`${origin}/login?error=auth`)
    }

    const { data: { user } } = await supabase.auth.getUser()

    let userRole = signupRole === 'employer' ? 'employer' : 'seeker'

    if (user) {
      console.log('[auth-callback] User authenticated', {
        userId: user.id,
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
        provider: user.app_metadata?.provider,
      })

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (userError && userError.code !== 'PGRST116') {
        console.error('[auth-callback] User query failed', { error: userError.message })
      }

      if (userData) {
        userRole = userData.role ?? userRole
        // OAuth users are always verified — sync the DB
        const { error: updateError } = await supabase
          .from('users')
          .update({ email_verified: true })
          .eq('id', user.id)

        if (updateError) {
          console.error('[auth-callback] Failed to update email_verified', { error: updateError.message })
        } else {
          console.log('[auth-callback] Set email_verified=true', { userId: user.id })
        }
      } else {
        // public.users row missing (trigger may have failed) — create it now
        const { error: insertError } = await supabase.from('users').insert({
          id: user.id,
          email: user.email!,
          role: userRole,
          email_verified: true,
        })

        if (insertError) {
          console.error('[auth-callback] Failed to create user row', { error: insertError.message })
        } else {
          console.log('[auth-callback] Created user row', { userId: user.id, role: userRole })
        }
      }

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

    console.log('[auth-callback] Redirecting', { dest, role: userRole })
    return NextResponse.redirect(`${origin}${dest}`)
  }

  console.error('[auth-callback] No code parameter')
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
