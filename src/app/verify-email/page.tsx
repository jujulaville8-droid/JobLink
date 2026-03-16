'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const RESEND_COOLDOWN_SECONDS = 60

export default function VerifyEmailPage() {
  const [email, setEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [hasSession, setHasSession] = useState(false)

  // Check verification status — used on mount and by the "I've Verified" button
  const checkVerification = useCallback(async (): Promise<boolean> => {
    try {
      const supabase = createClient()

      // Try getSession first (reads from local storage, fast)
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        console.log('[verify-email] No session found')
        setHasSession(false)
        return false
      }

      // Session exists — now get fresh user data from the server
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        console.log('[verify-email] getUser failed', { error: userError?.message })
        setHasSession(false)
        return false
      }

      setHasSession(true)
      setEmail(user.email ?? null)

      console.log('[verify-email] Checking verification', {
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
      })

      // Check auth-level verification
      if (!user.email_confirmed_at) {
        return false
      }

      // Check DB-level verification
      const { data: userData } = await supabase
        .from('users')
        .select('email_verified, role')
        .eq('id', user.id)
        .single()

      if (!userData || userData.email_verified !== true) {
        // Auth says verified but DB doesn't — sync it
        await supabase
          .from('users')
          .update({ email_verified: true })
          .eq('id', user.id)
        console.log('[verify-email] Synced email_verified=true in DB', { userId: user.id })
      }

      // User is verified — redirect to the app
      console.log('[verify-email] User is verified, redirecting')

      const role = userData?.role ?? user.user_metadata?.role ?? 'seeker'
      const dest = role === 'employer' ? '/post-job' : role === 'admin' ? '/dashboard' : '/jobs'

      // Full page navigation to ensure middleware sees updated session/cookies
      window.location.href = dest
      return true
    } catch (err) {
      console.error('[verify-email] Error checking verification', err)
      return false
    }
  }, [])

  // Auto-check on mount
  useEffect(() => {
    checkVerification().finally(() => {
      setInitialLoading(false)
    })
  }, [checkVerification])

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function handleCheckVerification() {
    setChecking(true)
    setError(null)

    const verified = await checkVerification()

    if (!verified) {
      if (!hasSession) {
        // No session at all — they need to sign in
        setError(null) // Don't show error, the UI below handles this
      } else {
        setError("Your email hasn't been verified yet. Please check your inbox and click the verification link.")
      }
    }

    setChecking(false)
  }

  async function handleResend() {
    if (cooldown > 0) return
    setResending(true)
    setError(null)
    setSent(false)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user?.email) {
        setError('No active session. Please sign in first, then resend the verification email.')
        setResending(false)
        return
      }

      console.log('[verify-email] Resend verification requested', {
        email: user.email,
        userId: user.id,
      })

      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
      })

      if (resendError) {
        console.error('[verify-email] Resend failed', {
          email: user.email,
          error: resendError.message,
          status: resendError.status,
        })

        if (resendError.message.includes('rate') || resendError.message.includes('limit')) {
          setError('Too many requests. Please wait a few minutes before trying again.')
        } else if (resendError.message.includes('already confirmed')) {
          setError(null)
          const verified = await checkVerification()
          if (verified) return
          setError('Your email appears verified but access is still pending. Please try clicking "I\'ve Verified My Email".')
        } else {
          setError("We couldn't resend the verification email right now. Please try again in a moment.")
        }
      } else {
        console.log('[verify-email] Resend success', { email: user.email })
        setSent(true)
        setCooldown(RESEND_COOLDOWN_SECONDS)
      }
    } catch (err) {
      console.error('[verify-email] Unexpected error during resend', err)
      setError("We couldn't resend the verification email right now. Please try again in a moment.")
    }

    setResending(false)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Show loading while checking initial verification status
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-mesh-teal flex items-center justify-center px-4">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-sm text-text-light">Checking verification status...</p>
        </div>
      </div>
    )
  }

  // No session — show sign-in prompt instead of "Session expired"
  if (!hasSession) {
    return (
      <div className="min-h-screen bg-mesh-teal flex items-center justify-center px-4">
        <div className="animate-scale-in bg-white rounded-[--radius-card] shadow-md border border-border p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-8 h-8 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
              />
            </svg>
          </div>

          <h2 className="font-display text-2xl text-text mb-2">
            Sign In Required
          </h2>
          <p className="text-text-light mb-6">
            Please sign in to check your verification status or access your account.
          </p>

          <a
            href="/login"
            className="inline-block w-full btn-primary py-3 text-center"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    )
  }

  // Has session but unverified — show verification prompt
  return (
    <div className="min-h-screen bg-mesh-teal flex items-center justify-center px-4">
      <div className="animate-scale-in bg-white rounded-[--radius-card] shadow-md border border-border p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg
            className="w-8 h-8 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>

        <h2 className="font-display text-2xl text-text mb-2">
          Verify Your Email
        </h2>
        <p className="text-text-light mb-2">
          You need to verify your email address before you can access JobLinks.
        </p>
        {email && (
          <p className="text-sm text-text-light mb-4">
            We sent a verification link to{' '}
            <span className="font-medium text-text">{email}</span>.
          </p>
        )}
        <p className="text-xs text-text-muted mb-6">
          Check your inbox and spam folder, then click the verification link.
        </p>

        {sent && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-[--radius-input] px-4 py-3">
            Verification email resent. Please check your inbox and spam folder.
          </div>
        )}

        {error && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-[--radius-input] px-4 py-3">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Check verification status */}
          <button
            onClick={handleCheckVerification}
            disabled={checking}
            className="w-full btn-primary py-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {checking ? (
              <span className="inline-flex items-center gap-2 justify-center">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking...
              </span>
            ) : (
              "I've Verified My Email"
            )}
          </button>

          {/* Resend verification */}
          <button
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="w-full rounded-[--radius-button] border-2 border-border bg-white px-4 py-3 text-sm font-medium text-text hover:bg-gray-50 hover:border-primary/30 transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {resending
              ? 'Sending...'
              : cooldown > 0
                ? `Resend available in ${cooldown}s`
                : 'Resend Verification Email'}
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-border space-y-2">
          <button
            onClick={handleSignOut}
            className="text-sm text-text-muted hover:text-red-500 transition-colors cursor-pointer"
          >
            Sign out and use a different account
          </button>
        </div>
      </div>
    </div>
  )
}
