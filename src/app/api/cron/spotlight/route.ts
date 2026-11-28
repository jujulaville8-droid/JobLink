import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { employerBillingEnabled } from '@/lib/employer-billing/config'
import { runSpotlightSchedule } from '@/lib/employer-billing/campaigns'

export const maxDuration = 120

/** Every 15 minutes: end Spotlights at 168 hours or when the vacancy closes, and send results. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!employerBillingEnabled()) return NextResponse.json({ skipped: 'disabled' })
  const result = await runSpotlightSchedule(createAdminClient())
  if (result.failed) console.error('[spotlight-cron] Some campaigns failed', result)
  return NextResponse.json(result)
}
