'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function VerifyConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')

    console.log('[verify-confirm] Starting verification', {
      hasTokenHash: !!tokenHash,
      type,
      url: window.location.href,
    })

    if (!tokenHash || type !== 'signup') {
      console.error('[verify-confirm] Missing or invalid params', { tokenHash: !!tokenHash, type })
      setError('Invalid verification link. Please request a new one.')
      return
    }

    const supabase = createClient()

    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'signup' })
      .then(async ({ data, error: verifyError }) => {
        if (verifyError) {
          console.error('[verify-confirm] verifyOtp failed', {
            error: verifyError.message,
            status: verifyError.status,
          })

          if (verifyError.message.includes('expired')) {
            setError('This verification link has expired. Please request a new verification email.')
          } else if (verifyError.message.includes('already')) {
            setError('This email has already been verified. You can sign in now.')
          } else {
            setError('This verification link is invalid or has expired. Please request a new one.')
          }
          return
        }

        const user = data?.user
        console.log('[verify-confirm] verifyOtp success', {
          userId: user?.id,
          email: user?.email,
          emailConfirmedAt: user?.email_confirmed_at,
        })

        if (!user) {
          setError('Verification succeeded but no user returned. Please try signing in.')
          return
        }

        let userRole = user.user_metadata?.role || 'seeker'

        try {
          // Ensure public.users row exists and mark email as verified
          const { data: existingUser } = await supabase
            .from('users')
            .select('id, role')
            .eq('id', user.id)
            .single()

          if (existingUser) {
            userRole = existingUser.role || userRole
            // Mark email as verified in public.users
            const { error: updateError } = await supabase
              .from('users')
              .update({ email_verified: true })
              .eq('id', user.id)

            if (updateError) {
              console.error('[verify-confirm] Failed to update email_verified', {
                userId: user.id,
                error: updateError.message,
              })
            } else {
              console.log('[verify-confirm] Set email_verified=true', { userId: user.id })
            }
          } else {
            // Create the user row if missing
            const { error: insertError } = await supabase.from('users').insert({
              id: user.id,
              email: user.email!,
              role: userRole,
              email_verified: true,
            })

            if (insertError) {
              console.error('[verify-confirm] Failed to insert user row', {
                userId: user.id,
                error: insertError.message,
              })
            } else {
              console.log('[verify-confirm] Created user row with email_verified=true', { userId: user.id })
            }
          }
        } catch (err) {
          console.error('[verify-confirm] DB sync error', err)
          // Continue anyway — the auth-level verification succeeded
        }

        const dest = userRole === 'employer' ? '/post-job' : userRole === 'admin' ? '/dashboard' : '/jobs'
        console.log('[verify-confirm] Redirecting', { dest, role: userRole })
        router.replace(dest)
      })
      .catch((err) => {
        console.error('[verify-confirm] Unexpected error', err)
        setError('Something went wrong during verification. Please try again.')
      })
  }, [router, searchParams])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="bg-white rounded-[--radius-card] shadow-md border border-border p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="font-display text-xl text-text mb-2">Verification Failed</h2>
          <p className="text-sm text-text-light mb-6">{error}</p>
          <div className="space-y-3">
            <a href="/login" className="inline-block w-full btn-primary py-3 text-center">
              Go to Sign In
            </a>
            <a href="/signup" className="inline-block w-full rounded-[--radius-button] border-2 border-border bg-white px-4 py-3 text-sm font-medium text-text hover:bg-gray-50 text-center">
              Sign Up Again
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
        <p className="text-sm text-text-light">Verifying your email...</p>
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
