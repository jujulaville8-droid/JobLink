import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/callback/reset
 *
 * Server-side handler for the password reset callback.
 * Supabase redirects here with a `code` param after the user clicks
 * the reset link in their email. We exchange the code for a session
 * (setting the auth cookies) and redirect to /reset-password.
 *
 * This replaces the old client-side page which was unreliable due to
 * race conditions between onAuthStateChange, exchangeCodeForSession,
 * and a 5-second timeout fallback.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  console.log('[reset-callback] Received', {
    hasCode: !!code,
    hasTokenHash: !!tokenHash,
    type,
  })

  const supabase = await createClient()

  // Case 1: PKCE flow — exchange code for session
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[reset-callback] Code exchange failed', {
        error: error.message,
        status: error.status,
      })
      return NextResponse.redirect(
        `${origin}/forgot-password?error=${encodeURIComponent('Reset link is invalid or expired. Please request a new one.')}`
      )
    }

    console.log('[reset-callback] Code exchange succeeded, redirecting to /reset-password')
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  // Case 2: Token hash flow (older Supabase email template)
  if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    })

    if (error) {
      console.error('[reset-callback] Token verification failed', {
        error: error.message,
        status: error.status,
      })
      return NextResponse.redirect(
        `${origin}/forgot-password?error=${encodeURIComponent('Reset link is invalid or expired. Please request a new one.')}`
      )
    }

    console.log('[reset-callback] Token verified, redirecting to /reset-password')
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  // No code or token — invalid request
  console.error('[reset-callback] No code or token_hash parameter')
  return NextResponse.redirect(
    `${origin}/forgot-password?error=${encodeURIComponent('Invalid reset link. Please request a new one.')}`
  )
}
