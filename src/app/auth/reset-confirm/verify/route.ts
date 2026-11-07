import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Only an explicit form submission redeems the single-use recovery token.
export async function POST(request: NextRequest) {
  const { origin, host } = new URL(request.url)
  const invalidLink = () => NextResponse.redirect(
    `${origin}/forgot-password?error=${encodeURIComponent('Invalid reset link. Please request a new one.')}`,
    303
  )
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite !== null && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return invalidLink()
  }
  const requestOrigin = request.headers.get('origin')
  if (requestOrigin !== null) {
    try {
      if (new URL(requestOrigin).host !== host) return invalidLink()
    } catch {
      return invalidLink()
    }
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
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
