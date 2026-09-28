import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestTestimonial } from '@/lib/testimonials'

export const maxDuration = 300
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const cutoff = new Date(Date.now() - 23 * 3600000).toISOString()
  const { data, error } = await createAdminClient().from('placements').select('id')
    .is('request_sent_at', null).is('feedback', null)
    .or(`request_started_at.is.null,request_started_at.gt.${cutoff}`).order('created_at').limit(50)
  if (error) return NextResponse.json({ error: 'Could not load requests' }, { status: 500 })
  let sent = 0
  for (const placement of data ?? []) {
    try { if (await requestTestimonial(placement.id)) sent++ } catch { console.error('[testimonials] Retry failed', placement.id) }
  }
  return NextResponse.json({ processed: data?.length ?? 0, sent })
}
