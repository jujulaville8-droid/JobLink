import { NextRequest, NextResponse } from 'next/server'

// Retained as a protected no-op for old scheduler callers. Jobs close manually.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!hasValidSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ success: true, disabled: true, closed_count: 0, closed_ids: [] })
}
