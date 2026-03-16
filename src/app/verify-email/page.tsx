'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const RESEND_COOLDOWN_SECONDS = 60

export default function VerifyEmailPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // Load user email on mount
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setEmail(user.email)
      }
    })
  }, [])

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

  async function handleResend() {
    if (cooldown > 0) return
    setResending(true)
    setError(null)
    setSent(false)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user?.email) {
        setError('Unable to find your account. Please sign out and try again.')
        setResending(false)
        return
      }

      console.log('[verify-email] Resend verification requested', {
        email: user.email,
        userId: user.id,
        environment: process.env.NODE_ENV,
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

        // User-friendly error messages
        if (resendError.message.includes('rate') || resendError.message.includes('limit')) {
          setError('Too many requests. Please wait a few minutes before trying again.')
        } else if (resendError.message.includes('already confirmed')) {
          // Email was already confirmed — refresh and redirect
          setError(null)
          const verified = await checkVerification()
          if (verified) return
          setError('Your email appears verified but access is still pending. Please try refreshing.')
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

  async function checkVerification(): Promise<boolean> {
    setChecking(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Session expired. Please sign in again.')
        setChecking(false)
        return false
      }

      console.log('[verify-email] Checking verification status', {
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
      })

      if (!user.email_confirmed_at) {
        setError("Your email hasn't been verified yet. Please check your inbox and click the verification link.")
        setChecking(false)
        return false
      }

      // Check DB-level too
      const { data: userData } = await supabase
        .from('users')
        .select('email_verified')
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

      // Verified — redirect to app
      console.log('[verify-email] User verified, redirecting', { email: user.email })

      const { data: roleData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      const role = roleData?.role ?? user.user_metadata?.role ?? 'seeker'
      const dest = role === 'employer' ? '/post-job' : role === 'admin' ? '/dashboard' : '/jobs'
      router.push(dest)
      router.refresh()
      return true
    } catch (err) {
      console.error('[verify-email] Error checking verification', err)
      setError('Something went wrong. Please try again.')
      setChecking(false)
      return false
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

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
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-[--radius-input] px-4 py-3">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Resend verification */}
          <button
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="w-full btn-primary py-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {resending
              ? 'Sending...'
              : cooldown > 0
                ? `Resend available in ${cooldown}s`
                : 'Resend Verification Email'}
          </button>

          {/* Check verification status */}
          <button
            onClick={() => checkVerification()}
            disabled={checking}
            className="w-full rounded-[--radius-button] border-2 border-border bg-white px-4 py-3 text-sm font-medium text-text hover:bg-gray-50 hover:border-primary/30 transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
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
