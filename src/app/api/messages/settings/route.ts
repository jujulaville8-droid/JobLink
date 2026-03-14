import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Fetch current user's messaging settings
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: settings } = await supabase
      .from('user_messaging_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Return defaults if no row exists
    return NextResponse.json(settings || {
      email_notifications: true,
      sms_notifications: false,
      show_online_status: true,
      show_read_receipts: true,
      notification_cooldown_minutes: 5,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT: Update messaging settings (upsert)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    // Whitelist fields
    const updates: Record<string, unknown> = {}
    if (typeof body.email_notifications === 'boolean') updates.email_notifications = body.email_notifications
    if (typeof body.sms_notifications === 'boolean') updates.sms_notifications = body.sms_notifications
    if (typeof body.show_online_status === 'boolean') updates.show_online_status = body.show_online_status
    if (typeof body.show_read_receipts === 'boolean') updates.show_read_receipts = body.show_read_receipts
    if (typeof body.notification_cooldown_minutes === 'number') {
      updates.notification_cooldown_minutes = Math.max(1, Math.min(60, body.notification_cooldown_minutes))
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('user_messaging_settings')
      .upsert({ user_id: user.id, ...updates }, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
