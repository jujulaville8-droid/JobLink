import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST: Heartbeat to update presence (call every 2-3 minutes from client)
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check if user wants to show online status
    const { data: settings } = await supabase
      .from('user_messaging_settings')
      .select('show_online_status')
      .eq('user_id', user.id)
      .single()

    const showOnline = settings?.show_online_status ?? true

    if (showOnline) {
      await supabase.rpc('upsert_presence', { p_user_id: user.id })
    } else {
      // If user turned off visibility, mark offline
      await supabase
        .from('user_presence')
        .upsert(
          { user_id: user.id, is_online: false, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
