'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function EmployerSignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleGoogleSignUp() {
    setError(null)
    setGoogleLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?role=employer`,
      },
    })
    if (error) {
      console.error('[employer-signup] Google OAuth error', { error: error.message })
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    console.log('[employer-signup] Signup attempt', { email, role: 'employer' })

    const supabase = createClient()
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role: 'employer' },
        emailRedirectTo: `${window.location.origin}/auth/verify-confirm?type=signup`,
      },
    })

    if (error) {
      console.error('[employer-signup] Signup failed', { email, error: error.message })
      setError(error.message)
      setLoading(false)
      return
    }

    // Supabase returns a fake success with empty identities when the email
    // is already registered (to prevent enumeration). Detect and surface it.
    if (signUpData.user && signUpData.user.identities?.length === 0) {
      console.log('[employer-signup] Duplicate email detected', { email })
      setError('duplicate_email')
      setLoading(false)
      return
    }

    console.log('[employer-signup] Signup success, verification email should be sent', {
      email,
      role: 'employer',
      userId: signUpData.user?.id,
    })

    // Don't sign out — the middleware blocks unverified users from protected
    // routes, and keeping the session means the verify-email page can access
    // the user's email and resend verification without requiring re-login.
    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="animate-scale-in bg-white dark:bg-surface rounded-[--radius-card] shadow-md border border-border p-8 text-center">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg
            className="w-8 h-8 text-emerald-600"
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
          Your account has been created
        </h2>
        <p className="text-text-light mb-2">
          Please verify your email before signing in. We&apos;ve sent a verification link to{' '}
          <span className="font-medium text-text">{email}</span>.
        </p>
        <p className="text-text-light mb-6">
          Click the link in your email to verify your account — you&apos;ll be signed in automatically.
        </p>
        <p className="text-xs text-text-muted">
          Didn&apos;t get the email? Check your spam folder or try signing up again.
        </p>
      </div>
    )
  }

  return (
    <div className="animate-scale-in bg-white dark:bg-surface rounded-[--radius-card] shadow-md border border-border p-8">
      <h1 className="font-display text-2xl text-text text-center mb-2">
        Create your employer account
      </h1>
      <p className="text-center text-sm text-text-light mb-6">
        Post jobs and connect with top candidates
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && error !== 'duplicate_email' && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[--radius-input] px-4 py-3">
            {error}
          </div>
        )}
        {error === 'duplicate_email' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[--radius-input] px-4 py-3">
            <p className="font-medium mb-1">This email already has an account.</p>
            <p className="mb-2">
              If you haven&apos;t verified yet, sign in and we&apos;ll help you resend the verification email.
            </p>
            <div className="flex gap-3">
              <a href="/employer/login" className="font-medium text-primary hover:text-primary-dark underline underline-offset-2">
                Sign in
              </a>
              <a href="/forgot-password" className="font-medium text-primary hover:text-primary-dark underline underline-offset-2">
                Forgot password?
              </a>
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-text-light mb-1.5"
          >
            Work email address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="input-base"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-text-light mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="input-base"
          />
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="block text-sm font-medium text-text-light mb-1.5"
          >
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
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
              Creating account...
            </span>
          ) : (
            'Create employer account'
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
        onClick={handleGoogleSignUp}
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
        Sign up with Google
      </button>

      <p className="mt-6 text-center text-sm text-text-light">
        Already have an account?{' '}
        <Link
          href="/employer/login"
          className="font-medium text-primary hover:text-primary-dark transition"
        >
          Sign in
        </Link>
      </p>

      <p className="mt-3 text-center text-sm text-text-muted">
        Looking for a job?{' '}
        <Link
          href="/signup"
          className="font-medium text-primary hover:text-primary-dark transition"
        >
          Sign up here &rarr;
        </Link>
      </p>
    </div>
  )
}
