'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function VerifyConfirmContent() {
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Verifying your email...')

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const code = searchParams.get('code')

    console.log('[verify-confirm] Starting verification', {
      hasTokenHash: !!tokenHash,
      hasCode: !!code,
      type,
      url: window.location.href,
    })

    const supabase = createClient()

    // Case 1: Direct token verification (custom email template)
    if (tokenHash && type === 'signup') {
      verifyWithToken(supabase, tokenHash)
      return
    }

    // Case 2: PKCE code exchange (ConfirmationURL flow)
    if (code) {
      verifyWithCode(supabase, code)
      return
    }

    // Case 3: No token or code — maybe the ConfirmationURL already
    // verified server-side and just redirected here. Check if the user
    // is already verified.
    console.log('[verify-confirm] No token_hash or code, checking if already verified')
    checkAlreadyVerified(supabase)
  }, [searchParams])

  async function verifyWithToken(supabase: ReturnType<typeof createClient>, tokenHash: string) {
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'signup',
      })

      if (verifyError) {
        console.error('[verify-confirm] verifyOtp failed', {
          error: verifyError.message,
          status: verifyError.status,
        })

        // Token might be already used — check if user is already verified
        const alreadyVerified = await checkAlreadyVerified(supabase)
        if (alreadyVerified) return

        setError(
          'This verification link is invalid, expired, or has already been used. ' +
          'Sign in to continue, or resend a new verification email.'
        )
        return
      }

      await finalizeVerification(supabase, data?.user)
    } catch (err) {
      console.error('[verify-confirm] Unexpected error in verifyWithToken', err)
      setError('Something went wrong during verification. Please try signing in.')
    }
  }

  async function verifyWithCode(supabase: ReturnType<typeof createClient>, code: string) {
    try {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeError) {
        console.error('[verify-confirm] Code exchange failed', {
          error: exchangeError.message,
        })

        const alreadyVerified = await checkAlreadyVerified(supabase)
        if (alreadyVerified) return

        setError(
          'This verification link is invalid, expired, or has already been used. ' +
          'Sign in to continue, or resend a new verification email.'
        )
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      await finalizeVerification(supabase, user)
    } catch (err) {
      console.error('[verify-confirm] Unexpected error in verifyWithCode', err)
      setError('Something went wrong during verification. Please try signing in.')
    }
  }

  async function checkAlreadyVerified(supabase: ReturnType<typeof createClient>): Promise<boolean> {
    try {
      // Check if there's an existing session with a verified user
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return false

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      console.log('[verify-confirm] Checking existing session', {
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
      })

      if (user.email_confirmed_at) {
        // User IS verified at auth level — finalize and redirect
        setStatus('Email already verified! Redirecting...')
        await finalizeVerification(supabase, user)
        return true
      }

      return false
    } catch {
      return false
    }
  }

  async function finalizeVerification(
    supabase: ReturnType<typeof createClient>,
    user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined
  ) {
    if (!user) {
      setError('Verification succeeded but no user returned. Please try signing in.')
      return
    }

    console.log('[verify-confirm] Finalizing verification', {
      userId: user.id,
      email: user.email,
    })

    setStatus('Email verified! Setting up your account...')

    let userRole = (user.user_metadata?.role as string) || 'seeker'

    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', user.id)
        .single()

      if (existingUser) {
        userRole = existingUser.role || userRole
        const { error: updateError } = await supabase
          .from('users')
          .update({ email_verified: true })
          .eq('id', user.id)

        if (updateError) {
          console.error('[verify-confirm] Failed to update email_verified', { error: updateError.message })
        } else {
          console.log('[verify-confirm] Set email_verified=true')
        }
      } else {
        const { error: insertError } = await supabase.from('users').insert({
          id: user.id,
          email: user.email!,
          role: userRole,
          email_verified: true,
        })

        if (insertError) {
          console.error('[verify-confirm] Failed to insert user row', { error: insertError.message })
        } else {
          console.log('[verify-confirm] Created user row with email_verified=true')
        }
      }
    } catch (err) {
      console.error('[verify-confirm] DB sync error', err)
    }

    const dest = userRole === 'employer' ? '/post-job' : userRole === 'admin' ? '/dashboard' : '/jobs'
    console.log('[verify-confirm] Redirecting', { dest, role: userRole })
    setStatus('Verification complete! Redirecting...')
    window.location.href = dest
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="bg-white rounded-[--radius-card] shadow-md border border-border p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="font-display text-xl text-text mb-2">Verification Issue</h2>
          <p className="text-sm text-text-light mb-6">{error}</p>
          <div className="space-y-3">
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault()
                handleSignOut().then(() => {
                  // handleSignOut already redirects
                })
              }}
              className="inline-block w-full btn-primary py-3 text-center cursor-pointer"
            >
              Sign In
            </a>
            <button
              onClick={handleSignOut}
              className="w-full rounded-[--radius-button] border-2 border-border bg-white px-4 py-3 text-sm font-medium text-text hover:bg-gray-50 text-center cursor-pointer"
            >
              Sign Out & Start Fresh
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
        <p className="text-sm text-text-light">{status}</p>
      </div>
    </div>
  )
}

export default function VerifyConfirmPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <VerifyConfirmContent />
    </Suspense>
  )
}
