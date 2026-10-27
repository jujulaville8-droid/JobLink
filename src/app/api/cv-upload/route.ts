import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/api-auth'
import { enforceRateLimit, RateLimits } from '@/lib/rate-limit'
import { validateCvFile, CV_NETWORK_ERROR } from '@/lib/cv-upload'

// Only metadata crosses Next/Vercel; the browser sends the file to Storage.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const limited = await enforceRateLimit(`cv-upload:${auth.user.id}`, RateLimits.profileWrite)
    if (limited) return limited
    const body = await request.json()
    if (!body || typeof body.name !== 'string' || typeof body.size !== 'number' ||
        (body.type !== undefined && typeof body.type !== 'string')) {
      return NextResponse.json({ error: 'Choose a readable resume file and try again.' }, { status: 400 })
    }
    const valid = validateCvFile(body)
    if (valid.error) return NextResponse.json({ error: valid.error }, { status: 400 })
    const path = `${auth.user.id}/cv-${randomUUID()}.${valid.extension}`
    // Use the seeker's session and existing INSERT policy; no overwrite or admin bypass.
    const { data, error } = await auth.supabase.storage.from('cvs').createSignedUploadUrl(path)
    if (error || !data) return NextResponse.json({ error: 'Could not authorize your resume upload. Sign in again and retry, or contact support@joblinkantigua.com.' }, { status: 503 })
    return NextResponse.json({ path, signedUrl: data.signedUrl, contentType: valid.contentType })
  } catch {
    return NextResponse.json({ error: CV_NETWORK_ERROR }, { status: 500 })
  }
}
