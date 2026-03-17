'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const verified = searchParams.get('verified') === 'true'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [unverified, setUnverified] = useState(false)
  const [resending, setResending] = useState(false)
  const [resentSuccess, setResentSuccess] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setGoogleLoading(true)
    const supabase = createClient()
    const callbackUrl = returnTo
      ? `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`
      : `${window.location.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    })
    if (error) {
      console.error('[login] Google OAuth error', { error: error.message })
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setUnverified(false)
    setResentSuccess(false)
    setLoading(true)

    console.log('[login] Sign-in attempt', { email })

    const supabase = createClient()
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error('[login] Sign-in failed', { email, error: error.message })
      setError(error.message)
      setLoading(false)
      return
    }

    // Immediately check verification status
    let userRole = 'seeker'
    let emailVerified = false

    if (signInData.user) {
      const hasAuthVerification = !!signInData.user.email_confirmed_at

      const { data: userData } = await supabase
        .from('users')
        .select('role, email_verified')
        .eq('id', signInData.user.id)
        .single()

      const currentMetaRole = signInData.user.user_metadata?.role
      userRole = userData?.role ?? currentMetaRole ?? 'seeker'

      // Both auth-level and DB-level must be true
      emailVerified = hasAuthVerification && userData?.email_verified === true

      // Sync role metadata if needed
      if (!currentMetaRole && userData?.role) {
        await supabase.auth.updateUser({ data: { role: userData.role } })
      }

      console.log('[login] Verification check', {
        email,
        authVerified: hasAuthVerification,
        dbVerified: userData?.email_verified,
        combined: emailVerified,
      })
    }

    // Block unverified users — redirect to verify-email (keep session so
    // they can resend verification). Do NOT sign out.
    if (!emailVerified) {
      console.log('[login] Unverified user, redirecting to verify-email', { email })
      setLoading(false)
      // Full page nav to avoid AuthRedirect race
      window.location.href = '/verify-email'
      return
    }

    console.log('[login] Sign-in success, redirecting', { email, role: userRole })

    // Redirect based on role — full page nav to avoid AuthRedirect race
    let dest = '/jobs'
    if (returnTo && returnTo.startsWith('/')) {
      dest = returnTo
    } else if (userRole === 'admin') {
      dest = '/dashboard'
    }
    window.location.href = dest
  }

  async function handleResendVerification() {
    setResending(true)
    setResentSuccess(false)
    setError(null)

    console.log('[login] Resend verification requested', { email })

    try {
      const supabase = createClient()
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email })

      if (resendError) {
        console.error('[login] Resend failed', { email, error: resendError.message })
        if (resendError.message.includes('rate') || resendError.message.includes('limit')) {
          setError('Too many requests. Please wait a few minutes before trying again.')
        } else {
          setError("We couldn't resend the verification email right now. Please try again in a moment.")
        }
        setUnverified(true)
      } else {
        console.log('[login] Resend success', { email })
        setResentSuccess(true)
        setError('You need to verify your email before accessing your account.')
        setUnverified(true)
      }
    } catch {
      setError("We couldn't resend the verification email right now. Please try again in a moment.")
      setUnverified(true)
    }

    setResending(false)
  }

  return (
    <div className="animate-scale-in bg-white dark:bg-surface rounded-[--radius-card] shadow-md border border-border p-8">
      <h1 className="font-display text-2xl text-text text-center mb-6">
        Welcome back
      </h1>

      {verified && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-[--radius-input] px-4 py-3 text-center">
          Your email has been verified successfully! Sign in to get started.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[--radius-input] px-4 py-3">
            <p>{error}</p>
            {unverified && (
              <div className="mt-2 space-y-1">
                <button
                  type="button"
                  disabled={resending}
                  onClick={handleResendVerification}
                  className="text-sm font-medium text-primary hover:text-primary-dark underline underline-offset-2 disabled:opacity-50 cursor-pointer"
                >
                  {resending ? 'Sending...' : resentSuccess ? 'Verification email sent!' : 'Resend verification email'}
                </button>
                {resentSuccess && (
                  <p className="text-xs text-text-muted">Check your inbox and spam folder.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-text-light mb-1.5"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-base"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-text-light"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-sm text-primary hover:text-primary-dark transition"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="input-base"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Signing in...
            </span>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white dark:bg-bg px-3 text-text-muted">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-3 rounded-[--radius-button] border-2 border-border bg-white dark:bg-surface px-4 py-2.5 text-sm font-medium text-text hover:bg-gray-50 dark:hover:bg-white/5 hover:border-primary/30 transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        {googleLoading ? (
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        )}
        Continue with Google
      </button>

      <p className="mt-6 text-center text-sm text-text-light">
        Don&apos;t have an account?{' '}
        <Link
          href="/signup"
          className="font-medium text-primary hover:text-primary-dark transition"
        >
          Create one
        </Link>
      </p>

      <p className="mt-3 text-center text-sm text-text-muted">
        Hiring?{' '}
        <Link
          href="/employer/login"
          className="font-medium text-primary hover:text-primary-dark transition"
        >
          Sign in as employer &rarr;
        </Link>
      </p>
    </div>
  )
}
