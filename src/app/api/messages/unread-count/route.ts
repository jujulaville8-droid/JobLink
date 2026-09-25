import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

// GET: Total unread message count for the current user (for nav badge)
export async function GET() {
  try {
    const auth = await requireUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

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
