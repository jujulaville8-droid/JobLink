import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Total unread message count for the current user (for nav badge)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase.rpc('get_total_unread_count', {
      p_user_id: user.id,
    })

    if (error) {
      // Fallback if RPC not deployed yet
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: data || 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
