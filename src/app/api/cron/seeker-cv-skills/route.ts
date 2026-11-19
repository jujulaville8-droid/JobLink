import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { runSeekerCvBackfill } from '@/lib/seeker-cv/backfill'
export const runtime = 'nodejs'
export const maxDuration = 180

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  const expected = secret ? `Bearer ${secret}` : ''
  if (!expected || Buffer.byteLength(auth) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try { return NextResponse.json(await runSeekerCvBackfill()) }
  catch { return NextResponse.json({ error: 'CV backfill unavailable' }, { status: 503 }) }
}
