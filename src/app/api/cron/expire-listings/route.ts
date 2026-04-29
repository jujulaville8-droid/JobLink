import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Expire Listings Cron Job
 *
 * Closes any job_listings where status = 'active' and expires_at <= now().
 * Without this, expired listings stay marked active and clutter search results.
 *
 * Protected by CRON_SECRET / x-vercel-cron header. Runs hourly via Vercel Cron.
 */
export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('job_listings')
      .update({ status: 'closed' })
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .lte('expires_at', now)
      .select('id, title')

    if (error) {
      console.error('[expire-listings] Update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const closed = data ?? []
    console.log(`[expire-listings] Closed ${closed.length} expired listing(s)`)

    return NextResponse.json({
      success: true,
      closed_count: closed.length,
      closed_ids: closed.map((l) => l.id),
    })
  } catch (err) {
    console.error('[expire-listings] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
