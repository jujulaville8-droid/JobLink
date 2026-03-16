'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VerifyEmailPage() {
  const router = useRouter()
  const [resending, setResending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleResend() {
    setResending(true)
    setError(null)
    setSent(false)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
      setError('Unable to find your account. Please sign in again.')
      setResending(false)
      return
    }

    const { error } = await supabase.auth.resend({ type: 'signup', email: user.email })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setResending(false)
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
        <p className="text-text-light mb-6">
          You need to verify your email address before you can access JobLinks. Check your inbox for the verification link.
        </p>

        {sent && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-[--radius-input] px-4 py-3">
            Verification email sent! Check your inbox.
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-[--radius-input] px-4 py-3">
            {error}
          </div>
        )}

        <button
          onClick={handleResend}
          disabled={resending}
          className="w-full btn-primary py-3 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {resending ? 'Sending...' : 'Resend Verification Email'}
        </button>

        <p className="mt-4 text-xs text-text-muted">
          Didn&apos;t get the email? Check your spam folder or try resending.
        </p>

        <button
          onClick={handleSignOut}
          className="mt-4 text-sm text-text-muted hover:text-red-500 transition-colors cursor-pointer"
        >
          Sign out and use a different account
        </button>
      </div>
    </div>
  )
}
