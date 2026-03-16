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

    if (!tokenHash || type !== 'signup') {
      router.replace('/login?error=auth')
      return
    }

    const supabase = createClient()
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'signup' }).then(async ({ data, error }) => {
      if (error) {
        setError('This verification link has expired or is invalid. Please try signing up again.')
        return
      }

      // Determine role and redirect accordingly
      const user = data?.user
      let userRole = 'seeker'

      if (user) {
        userRole = user.user_metadata?.role || 'seeker'

        // Ensure public.users row exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id, role')
          .eq('id', user.id)
          .single()

        if (existingUser) {
          userRole = existingUser.role || userRole
        } else {
          await supabase.from('users').insert({
            id: user.id,
            email: user.email!,
            role: userRole,
          })
        }
      }

      const dest = userRole === 'employer' ? '/post-job' : '/jobs'
      router.replace(dest)
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
          <a href="/signup" className="inline-block w-full btn-primary py-3 text-center">
            Sign Up Again
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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
