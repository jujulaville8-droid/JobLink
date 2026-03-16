'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password')
      } else if (event === 'SIGNED_IN') {
        // Recovery sometimes fires as SIGNED_IN — redirect to reset anyway
        // since this page is only reached from the password reset flow
        router.replace('/reset-password')
      }
    })

    // Also handle PKCE flow where code is in query params
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!error) {
          router.replace('/reset-password')
        } else {
          router.replace('/login?error=auth')
        }
      })
    }

    // Fallback: if nothing happens after 5 seconds, redirect to login
    const timeout = setTimeout(() => {
      router.replace('/login?error=auth')
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}
