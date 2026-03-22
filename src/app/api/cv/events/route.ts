import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { event_type, metadata } = await request.json()
    if (!event_type) return NextResponse.json({ error: 'Missing event_type' }, { status: 400 })

    await supabase.from('cv_events').insert({
      user_id: user.id,
      event_type,
      metadata: metadata || {},
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
