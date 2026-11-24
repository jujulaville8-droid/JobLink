'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { claimReturnTo, onboardingReturnTo, withReturnTo } from '@/lib/claim-links'
import { createClient } from '@/lib/supabase/client'

const expiredLinkMessage = 'This verification link has expired or has already been used. Please request a fresh verification email.'

function VerifyConfirmContent() {
  const searchParams = useSearchParams()
  const startedFor = useRef<string | null>(null)
  const verificationComplete = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Verifying your email...')
  const [email, setEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)

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

        // Token might be already used. Check if user is already verified.
        const alreadyVerified = await checkAlreadyVerified(supabase)
        if (alreadyVerified) return

        setError(
          'This verification link is invalid, expired, or has already been used. ' +
          'Sign in to continue, or resend a new verification email.'
        )
        return
      }

      await finalizeVerification(data?.user)
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
      await finalizeVerification(user)
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
        emailConfirmed: !!user.email_confirmed_at,
      })

      if (user.email_confirmed_at) {
        // User IS verified at auth level. Finalize and redirect.
        setStatus('Email already verified! Redirecting...')
        await finalizeVerification(user)
        return true
      }

      return false
    } catch {
      return false
    }
  }

  async function finalizeVerification(
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

    // Call the server API to sync email_verified in the DB.
    // This uses the admin client server-side to bypass RLS.
    // the browser client can't update email_verified due to RLS policies.
    let userRole = (user.user_metadata?.role as string) || 'seeker'
    let hasProfile = false

    try {
      const res = await fetch('/api/auth/sync-verification', { method: 'POST' })

      if (res.ok) {
        const data = await res.json()
        userRole = data.role || userRole
        hasProfile = data.hasProfile === true
        console.log('[verify-confirm] Server sync succeeded', { role: userRole, hasProfile })
      } else {
        const errData = await res.json().catch(() => ({}))
        console.error('[verify-confirm] Server sync failed', {
          status: res.status,
          error: errData.error,
        })
        // Don't block. The verify-email page can also attempt sync.
      }
    } catch (err) {
      console.error('[verify-confirm] Server sync request failed', err)
    }

    // New users without a profile go to profile creation first
    let dest: string
    if (!hasProfile) {
      dest = userRole === 'employer' ? '/company-profile' : '/profile'
    } else {
      dest = userRole === 'employer' ? '/post-job' : userRole === 'admin' ? '/dashboard' : '/jobs'
    }
    console.log('[verify-confirm] Redirecting', { dest, role: userRole })
    setStatus('Verification complete! Redirecting...')
    const returnTo = onboardingReturnTo(searchParams.get('returnTo')) ?? claimReturnTo(user.user_metadata?.claim_return_to) ?? onboardingReturnTo(user.user_metadata?.onboarding_return_to)
    if (user.user_metadata?.claim_return_to) {
      await createClient().auth.updateUser({ data: { claim_return_to: null } })
    }
    if (user.user_metadata?.onboarding_return_to) await createClient().auth.updateUser({ data: { onboarding_return_to: null } })
    verificationComplete.current = true
    window.location.href = returnTo ?? dest
  }

  useEffect(() => {
    // Supabase can return errors without a token or code, including in the hash.
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    if (searchParams.has('error') || searchParams.has('error_code') ||
        hashParams.has('error') || hashParams.has('error_code')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(expiredLinkMessage)
      return
    }

    // Redeem once per URL, including React Strict Mode's repeated effect setup.
    const verificationUrl = searchParams.toString()
    if (startedFor.current === verificationUrl) return
    startedFor.current = verificationUrl
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const code = searchParams.get('code')

    console.log('[verify-confirm] Starting verification', {
      hasTokenHash: !!tokenHash,
      hasCode: !!code,
      type,
      // Deliberately not window.location.href: it carries the one-time
      // verification token_hash / OAuth code.
    })

    const supabase = createClient()

    // Redeeming the token against Supabase is synchronising with an external
    // system, which is what effects are for. The helpers below set status
    // state before their first await, which the lint rule reads as a
    // cascading render; running them anywhere else would redeem the one-time
    // token during render.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (tokenHash && type === 'signup') {
      verifyWithToken(supabase, tokenHash)
      return
    }

    if (code) {
      verifyWithCode(supabase, code)
      return
    }

    console.log('[verify-confirm] No token_hash or code, checking if already verified')
    checkAlreadyVerified(supabase).then((alreadyVerified) => {
      if (!alreadyVerified) setError(expiredLinkMessage)
    })
    /* eslint-enable react-hooks/set-state-in-effect */
    // The verification helpers intentionally run once for this URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Keep the timer separate from the redemption guard so Strict Mode cleanup
  // does not disable it when the verification effect runs a second time.
  useEffect(() => {
    if (error) return
    const timeout = window.setTimeout(() => {
      if (!verificationComplete.current) {
        setError('Verification is taking too long. Please try signing in or request a fresh verification email.')
      }
    }, 15_000)
    return () => window.clearTimeout(timeout)
  }, [error, searchParams])

  async function handleResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (resending) return
    setResending(true)
    setResendSuccess(null)
    setResendError(null)

    try {
      const { error: resendFailure } = await createClient().auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin + '/auth/verify-confirm?type=signup',
        },
      })
      if (resendFailure) {
        setResendError('We could not send the verification email. Please check your email address and try again shortly.')
        return
      }
      setResendSuccess('Verification email sent. Check your inbox and spam folder.')
    } catch {
      setResendError('We could not send the verification email. Please check your connection and try again.')
    } finally {
      setResending(false)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    const returnTo = onboardingReturnTo(searchParams.get('returnTo'))
    window.location.href = withReturnTo(claimReturnTo(returnTo) ? '/employer/login' : '/login', returnTo)
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="bg-white rounded-card shadow-md border border-border p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="font-display text-xl text-text mb-2">Verification Issue</h2>
          <p className="text-sm text-text-light mb-6">{error}</p>
          <form onSubmit={handleResend} className="space-y-3 mb-6 text-left">
            <label htmlFor="verification-email" className="block text-sm font-medium text-text">
              Email address
            </label>
            <input
              id="verification-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-button border border-border px-4 py-3 text-sm text-text"
            />
            <button
              type="submit"
              disabled={resending}
              className="w-full btn-primary py-3 text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resending ? 'Sending...' : 'Resend verification email'}
            </button>
            {resendSuccess && <p role="status" className="text-sm text-green-700">{resendSuccess}</p>}
            {resendError && <p role="alert" className="text-sm text-red-600">{resendError}</p>}
          </form>
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
              className="w-full rounded-button border-2 border-border bg-white px-4 py-3 text-sm font-medium text-text hover:bg-gray-50 text-center cursor-pointer"
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
