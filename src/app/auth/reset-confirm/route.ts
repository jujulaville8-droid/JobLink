import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /auth/reset-confirm?token_hash=XXX&type=recovery
 *
 * Handles the password reset link from the Supabase email template.
 * The template sends users directly here with a token_hash (not through
 * Supabase's server), so we must verify the OTP ourselves and establish
 * a recovery session before redirecting to /reset-password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  console.log('[reset-confirm] Received', {
    hasTokenHash: !!tokenHash,
    type,
  })

  if (!tokenHash || type !== 'recovery') {
    console.error('[reset-confirm] Missing token_hash or wrong type')
    return NextResponse.redirect(
      `${origin}/forgot-password?error=${encodeURIComponent('Invalid reset link. Please request a new one.')}`
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'recovery',
  })

  if (error) {
    console.error('[reset-confirm] Token verification failed', {
      error: error.message,
      status: error.status,
    })
    return NextResponse.redirect(
      `${origin}/forgot-password?error=${encodeURIComponent('This reset link is invalid or has expired. Please request a new one.')}`
    )
  }

  console.log('[reset-confirm] Token verified, redirecting to /reset-password')
  return NextResponse.redirect(`${origin}/reset-password`)
}
