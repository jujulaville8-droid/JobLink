import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Only an explicit form submission redeems the single-use recovery token.
//
// There is deliberately no sec-fetch-site / origin gate here. The token
// itself is the capability: single use, high entropy, time limited, and
// useless to anyone who does not already hold the emailed link. Header
// heuristics silently rejected legitimate submissions from mail app
// webviews and other real clients, which looped users back to the
// "invalid link" error with no server side trace of the attempt.
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url)
  const invalidLink = () => NextResponse.redirect(
    `${origin}/forgot-password?error=${encodeURIComponent('Invalid reset link. Please request a new one.')}`,
    303
  )

  const originHeader = request.headers.get('origin')
  let originHost: string | null = null
  if (originHeader !== null) {
    try {
      originHost = new URL(originHeader).host
    } catch {
      originHost = 'malformed'
    }
  }
  console.log('[reset-confirm] POST received', {
    secFetchSite: request.headers.get('sec-fetch-site'),
    originHost,
  })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    console.error('[reset-confirm] Could not parse form body')
    return invalidLink()
  }
  const tokenHash = formData.get('token_hash')
  const type = formData.get('type')

  console.log('[reset-confirm] Received', {
    hasTokenHash: !!tokenHash,
    isRecovery: type === 'recovery',
  })

  if (typeof tokenHash !== 'string' || !tokenHash || type !== 'recovery') {
    console.error('[reset-confirm] Missing token_hash or wrong type')
    return invalidLink()
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'recovery',
  })

  if (error) {
    console.error('[reset-confirm] Token verification failed', {
      message: error.message,
      status: error.status,
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return NextResponse.redirect(`${origin}/reset-password`, 303)
    return NextResponse.redirect(
      `${origin}/forgot-password?error=${encodeURIComponent('This reset link is invalid or has expired. Please request a new one.')}`,
      303
    )
  }

  console.log('[reset-confirm] Token verified, redirecting to /reset-password')
  return NextResponse.redirect(`${origin}/reset-password`, 303)
}
