import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Debug endpoint to check messaging tables and permissions
// Remove this in production
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not logged in', user: null }, { status: 401 })
    }

    const checks: Record<string, unknown> = {
      user_id: user.id,
      user_email: user.email,
    }

    // Check user role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    checks.user_role = userData?.role || null
    checks.user_error = userError?.message || null

    // Check if conversations table exists and is accessible
    const { data: convs, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .limit(1)
    checks.conversations_accessible = !convError
    checks.conversations_error = convError?.message || null
    checks.conversations_count_sample = convs?.length ?? 0

    // Check if conversation_participants table is accessible
    const { data: parts, error: partError } = await supabase
      .from('conversation_participants')
      .select('id')
      .limit(1)
    checks.participants_accessible = !partError
    checks.participants_error = partError?.message || null

    // Check if messages table is accessible
    const { data: msgs, error: msgError } = await supabase
      .from('messages')
      .select('id')
      .limit(1)
    checks.messages_accessible = !msgError
    checks.messages_error = msgError?.message || null

    // Check RPC functions
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_total_unread_count', {
      p_user_id: user.id,
    })
    checks.rpc_unread_count = rpcData
    checks.rpc_unread_error = rpcError?.message || null

    const { data: inboxData, error: inboxError } = await supabase.rpc('get_inbox', {
      p_user_id: user.id,
      p_archived: false,
    })
    checks.rpc_inbox_count = inboxData?.length ?? 0
    checks.rpc_inbox_error = inboxError?.message || null

    // Try to create a test conversation insert (then rollback)
    // Just test if INSERT is allowed on conversations
    const { error: insertTestError } = await supabase
      .from('conversations')
      .insert({ application_id: '00000000-0000-0000-0000-000000000000' })
      .select()
      .single()
    checks.conversations_insert_test = insertTestError?.message || 'INSERT allowed (FK would fail which is expected)'
    // Expected error: FK violation (which means INSERT permission is fine, just no matching application)

    // Check message_templates
    const { data: templates, error: templError } = await supabase
      .from('message_templates')
      .select('id, label')
      .limit(3)
    checks.templates_accessible = !templError
    checks.templates_error = templError?.message || null
    checks.templates_sample = templates?.length ?? 0

    // Check user_messaging_settings
    const { data: settings, error: settError } = await supabase
      .from('user_messaging_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    checks.settings_accessible = !settError
    checks.settings_error = settError?.message || null
    checks.settings_exists = !!settings

    // Check user_presence
    const { error: presError } = await supabase
      .from('user_presence')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    checks.presence_accessible = !presError
    checks.presence_error = presError?.message || null

    // Check notification_log
    const { error: notifError } = await supabase
      .from('notification_log')
      .select('id')
      .limit(1)
    checks.notification_log_accessible = !notifError
    checks.notification_log_error = notifError?.message || null

    // Check conversation_reports
    const { error: reportError } = await supabase
      .from('conversation_reports')
      .select('id')
      .limit(1)
    checks.reports_accessible = !reportError
    checks.reports_error = reportError?.message || null

    // Check if user has any applications
    const { data: apps, error: appsError } = await supabase
      .from('applications')
      .select('id')
      .limit(3)
    checks.applications_accessible = !appsError
    checks.applications_error = appsError?.message || null
    checks.applications_count_sample = apps?.length ?? 0

    return NextResponse.json(checks)
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected error', details: String(err) }, { status: 500 })
  }
}
