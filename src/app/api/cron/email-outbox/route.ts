import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deliverReminder } from '@/lib/reminder-outbox'
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('email_outbox').select('id')
      .in('status', ['pending', 'sending']).order('created_at').limit(50)
    if (error) throw error
    let sent = 0, failed = 0
    for (const mail of data || []) {
      try { if (await deliverReminder(admin, mail.id)) sent++ } catch { failed++ }
    }
    const { count: needsReview, error: reviewError } = await admin.from('email_outbox')
      .select('id', { count: 'exact', head: true }).eq('status', 'needs_review')
    if (reviewError) throw reviewError
    return NextResponse.json({ sent, failed, needsReview }, { status: failed || needsReview ? 503 : 200 })
  } catch {
    return NextResponse.json({ error: 'Outbox temporarily unavailable' }, { status: 503 })
  }
}
