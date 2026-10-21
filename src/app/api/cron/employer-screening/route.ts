import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { runEmployerScreeningWorker } from '@/lib/employer-screening/worker'
export const runtime = 'nodejs'
export const maxDuration = 180
/** Scheduler registration is deliberately not included. Deployment approval must
 * verify a cadence/timeout capable of meeting the two-minute baseline deadline. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  const expected = secret ? `Bearer ${secret}` : ''
  if (!expected || Buffer.byteLength(auth) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try { return NextResponse.json(await runEmployerScreeningWorker()) }
  catch { return NextResponse.json({ error: 'Employer delivery worker unavailable' }, { status: 503 }) }
}
