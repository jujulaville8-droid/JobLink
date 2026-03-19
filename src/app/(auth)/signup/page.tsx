'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Role = 'seeker' | 'employer'
type Step = 'role-selection' | 'signup-form'

// ─── Spinner ───
function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ─── Google Icon ───
function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

// ─── Check Badge ───
function CheckBadge() {
  return (
    <div className="absolute top-3 right-3">
      <svg className="w-6 h-6 text-primary" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  )
}

export default function SignupPage() {
  const searchParams = useSearchParams()
  const preselectedRole = searchParams.get('role') as Role | null

  const [step, setStep] = useState<Step>(preselectedRole ? 'signup-form' : 'role-selection')
  const [role, setRole] = useState<Role | null>(preselectedRole)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // Respect URL ?role= param
  useEffect(() => {
    if (preselectedRole === 'seeker' || preselectedRole === 'employer') {
      setRole(preselectedRole)
      setStep('signup-form')
    }
  }, [preselectedRole])

  function handleContinue() {
    if (!role) return
    setError(null)
    setStep('signup-form')
  }

  function handleBack() {
    setStep('role-selection')
    setError(null)
  }

  async function handleGoogleSignUp() {
    if (!role) return
    setError(null)
    setGoogleLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?role=${role}`,
      },
    })
    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!role) {
      setStep('role-selection')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role },
        emailRedirectTo: `${window.location.origin}/auth/verify-confirm?type=signup`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (signUpData.user && signUpData.user.identities?.length === 0) {
      setError('duplicate_email')
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  // ─── SUCCESS STATE ───
  if (success) {
    return (
      <div className="animate-scale-in bg-white rounded-[--radius-card] shadow-md border border-border p-8 text-center mx-auto max-w-md">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 className="font-display text-2xl text-text mb-2">Your account has been created</h2>
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

  // ─── STEP 1: ROLE SELECTION ───
  if (step === 'role-selection') {
    return (
      <div className="animate-scale-in bg-white rounded-[--radius-card] shadow-md border border-border px-8 sm:px-12 py-10 sm:py-14">
        <h1 className="font-display text-2xl sm:text-3xl text-text text-center mb-2">
          Join JobLinks
        </h1>
        <p className="text-center text-sm sm:text-base text-text-light mb-10 sm:mb-12">
          I want to...
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Job Seeker Card */}
          <button
            type="button"
            onClick={() => setRole('seeker')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRole('seeker') } }}
            role="radio"
            aria-checked={role === 'seeker'}
            tabIndex={0}
            className={`relative rounded-2xl border-2 px-7 py-8 text-left transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              role === 'seeker'
                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                : 'border-border hover:border-primary/30 hover:shadow-md bg-white'
            }`}
          >
            {role === 'seeker' && <CheckBadge />}
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-colors ${
              role === 'seeker' ? 'bg-primary/10' : 'bg-bg-alt'
            }`}>
              <svg
                className={`w-7 h-7 ${role === 'seeker' ? 'text-primary' : 'text-text-muted'}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <p className={`text-lg font-semibold mb-1.5 ${role === 'seeker' ? 'text-primary' : 'text-text'}`}>
              I&apos;m looking for a job
            </p>
            <p className="text-sm text-text-muted leading-relaxed">
              Browse opportunities and apply to positions across Antigua &amp; Barbuda
            </p>
          </button>

          {/* Employer Card */}
          <button
            type="button"
            onClick={() => setRole('employer')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRole('employer') } }}
            role="radio"
            aria-checked={role === 'employer'}
            tabIndex={0}
            className={`relative rounded-2xl border-2 px-7 py-8 text-left transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              role === 'employer'
                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                : 'border-border hover:border-primary/30 hover:shadow-md bg-white'
            }`}
          >
            {role === 'employer' && <CheckBadge />}
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-colors ${
              role === 'employer' ? 'bg-primary/10' : 'bg-bg-alt'
            }`}>
              <svg
                className={`w-7 h-7 ${role === 'employer' ? 'text-primary' : 'text-text-muted'}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <p className={`text-lg font-semibold mb-1.5 ${role === 'employer' ? 'text-primary' : 'text-text'}`}>
              I&apos;m hiring
            </p>
            <p className="text-sm text-text-muted leading-relaxed">
              Post job listings and find qualified candidates for your business
            </p>
          </button>
        </div>

        {/* Continue Button */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={!role}
          className="w-full mt-10 sm:mt-12 btn-primary py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {role === 'employer' ? 'Continue as Employer' : role === 'seeker' ? 'Continue as Job Seeker' : 'Select an option to continue'}
        </button>

        <p className="mt-8 text-center text-sm text-text-light">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-primary hover:text-primary-dark transition">
            Sign in
          </a>
        </p>
      </div>
    )
  }

  // ─── STEP 2: SIGNUP FORM ───
  return (
    <div className="animate-scale-in bg-white rounded-[--radius-card] shadow-md border border-border p-8 mx-auto max-w-md">
      {/* Back button + heading */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-bg-alt transition-colors shrink-0"
          aria-label="Back to role selection"
        >
          <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <h1 className="font-display text-xl text-text">
            {role === 'employer' ? 'Create your employer account' : 'Create your account'}
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            {role === 'employer' ? 'Post jobs and connect with candidates' : 'Find your next opportunity'}
          </p>
        </div>
      </div>

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
              <a href="/login" className="font-medium text-primary hover:text-primary-dark underline underline-offset-2">
                Sign in
              </a>
              <a href="/forgot-password" className="font-medium text-primary hover:text-primary-dark underline underline-offset-2">
                Forgot password?
              </a>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-light mb-1.5">
            {role === 'employer' ? 'Work email address' : 'Email address'}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={role === 'employer' ? 'you@company.com' : 'you@example.com'}
            className="input-base"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-text-light mb-1.5">
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
          <label htmlFor="confirm-password" className="block text-sm font-medium text-text-light mb-1.5">
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
              <Spinner />
              Creating account...
            </span>
          ) : (
            role === 'employer' ? 'Create employer account' : 'Create account'
          )}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-3 text-text-muted">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignUp}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-3 rounded-[--radius-button] border-2 border-border bg-white px-4 py-2.5 text-sm font-medium text-text hover:bg-gray-50 hover:border-primary/30 transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        {googleLoading ? <Spinner /> : <GoogleIcon />}
        Sign up with Google
      </button>

      <p className="mt-6 text-center text-sm text-text-light">
        Already have an account?{' '}
        <a href="/login" className="font-medium text-primary hover:text-primary-dark transition">
          Sign in
        </a>
      </p>
    </div>
  )
}
