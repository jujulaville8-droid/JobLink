'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  // Validate that we have a valid recovery session on mount
  useEffect(() => {
    async function checkSession() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        console.log('[reset-password] No session found')
        setHasSession(false)
        return
      }

      // Verify the session is real (getUser hits the server)
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        console.log('[reset-password] Session invalid', { error: error?.message })
        setHasSession(false)
        return
      }

      console.log('[reset-password] Valid session', { email: user.email })
      setHasSession(true)
    }

    checkSession()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      console.error('[reset-password] Update failed', { error: error.message })
      if (error.message.includes('session') || error.message.includes('not authenticated')) {
        setError('Your reset session has expired. Please request a new password reset link.')
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    console.log('[reset-password] Password updated successfully')
    setSuccess(true)

    // Sign out and redirect to login so the user logs in with their new password
    await supabase.auth.signOut()

    setTimeout(() => {
      window.location.href = '/login'
    }, 2000)
  }

  // Loading state while checking session
  if (hasSession === null) {
    return (
      <div className="animate-scale-in bg-white rounded-[--radius-card] shadow-md border border-border p-8 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
        <p className="text-sm text-text-light">Verifying your reset link...</p>
      </div>
    )
  }

  // No valid session — show error with link to request a new reset
  if (!hasSession) {
    return (
      <div className="animate-scale-in bg-white rounded-[--radius-card] shadow-md border border-border p-8 text-center">
        <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="font-display text-xl text-text mb-2">Reset Link Expired</h2>
        <p className="text-sm text-text-light mb-6">
          This password reset link is no longer valid. Reset links expire after 1 hour and can only be used once.
        </p>
        <a
          href="/forgot-password"
          className="inline-block w-full btn-primary py-3 text-center"
        >
          Request New Reset Link
        </a>
      </div>
    )
  }

  return (
    <div className="animate-scale-in bg-white rounded-[--radius-card] shadow-md border border-border p-8 mx-auto max-w-md">
      <h1 className="font-display text-2xl text-text text-center mb-2">
        Set new password
      </h1>
      <p className="text-center text-sm text-text-light mb-6">
        Enter your new password below.
      </p>

      {success ? (
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 mb-4">
            <svg className="h-6 w-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <p className="text-sm text-text-light">
            Password updated! Redirecting to sign in...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[--radius-input] px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-text-light mb-1.5"
            >
              New password
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
              placeholder="Repeat your password"
              className="input-base"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Updating...
              </span>
            ) : (
              'Update password'
            )}
          </button>
        </form>
      )}
    </div>
  )
}
