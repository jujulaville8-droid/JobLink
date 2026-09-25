import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

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
