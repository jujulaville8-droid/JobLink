import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLAIM_TOKEN_PATTERN, CLAIM_UNAVAILABLE_MESSAGE } from '@/lib/claim-links'

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const auth = await requireVerifiedUser()
  if ('error' in auth) return auth.error
  // A claim changes ownership. Refuse cross-origin browser requests as well as
  // requiring the verified session and the unguessable bearer token.
  const origin = request.headers.get('origin')
  // Next can construct request.url with an internal hostname behind a proxy.
  // Host is the authority the browser actually addressed (not X-Forwarded-Host).
  const requestUrl = new URL(request.url)
  let sameOrigin = !origin
  if (origin) {
    try {
      const source = new URL(origin)
      sameOrigin = source.origin === origin && source.protocol === requestUrl.protocol &&
        source.host === (request.headers.get('host') ?? requestUrl.host)
    } catch { sameOrigin = false }
  }
  if (!sameOrigin) {
    return NextResponse.json({ error: 'Please claim from the JobLink website.' }, { status: 403 })
  }
  const { token } = await params
  if (!CLAIM_TOKEN_PATTERN.test(token)) return NextResponse.json({ error: CLAIM_UNAVAILABLE_MESSAGE }, { status: 410 })
  const { data, error } = await createAdminClient().rpc('claim_company', { p_token: token, p_user_id: auth.user.id })
  if (error) {
    const errors: Record<string, [number, string]> = {
      CLAIM_UNAVAILABLE: [410, CLAIM_UNAVAILABLE_MESSAGE],
      EMPLOYER_REQUIRED: [403, 'Please sign in with an employer account to claim this company.'],
      EMAIL_UNVERIFIED: [403, 'Please verify your email before claiming this company.'],
      COMPANY_ALREADY_OWNED: [409, 'You already manage a company. Contact employers@joblinkantigua.com for help; companies cannot be merged automatically.'],
    }
    const [status, message] = errors[error.message] ?? (error.code === '23505' ? errors.COMPANY_ALREADY_OWNED : [500, 'Could not complete the claim. Please try again.'])
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!data?.[0]) return NextResponse.json({ error: 'Could not complete the claim. Please try again.' }, { status: 500 })
  return NextResponse.json({ redirectTo: `/dashboard?claimed=${data[0].company_id}` }, { headers: { 'Cache-Control': 'no-store' } })
}
