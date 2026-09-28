import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyEmployerEnquiry } from '@/lib/employer-enquiry-notifications'

export const maxDuration = 300
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cutoff = new Date(Date.now() - 23 * 3600000).toISOString()
  const { data, error } = await createAdminClient().from('employer_enquiries').select('id').is('notification_sent_at', null)
    .or(`notification_started_at.is.null,notification_started_at.gt.${cutoff}`).order('created_at').limit(50)
  if (error) return NextResponse.json({ error: 'Could not load notifications' }, { status: 500 })
  let sent = 0
  for (const row of data ?? []) { try { if (await notifyEmployerEnquiry(row.id)) sent++ } catch { console.error('[employer-enquiry] Retry failed', row.id) } }
  return NextResponse.json({ processed: data?.length ?? 0, sent })
}
