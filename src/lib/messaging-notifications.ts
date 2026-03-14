import { sendEmail } from '@/lib/email'
import type { SupabaseClient } from '@supabase/supabase-js'

interface NotificationParams {
  conversationId: string
  recipientId: string
  senderName: string
  jobTitle: string
  messagePreview: string
}

/**
 * Send a message notification with dedup (cooldown-based).
 * Checks the recipient's messaging settings and notification_log
 * to avoid spamming. Fire-and-forget — never throws.
 */
export async function sendMessageNotification(
  supabase: SupabaseClient,
  params: NotificationParams
): Promise<void> {
  const { conversationId, recipientId, senderName, jobTitle, messagePreview } = params

  try {
    // Check recipient's notification settings
    const { data: settings } = await supabase
      .from('user_messaging_settings')
      .select('email_notifications, notification_cooldown_minutes')
      .eq('user_id', recipientId)
      .single()

    // Default to enabled if no settings row exists
    const emailEnabled = settings?.email_notifications ?? true
    const cooldownMinutes = settings?.notification_cooldown_minutes ?? 5

    if (!emailEnabled) {
      // Log as skipped
      await supabase.from('notification_log').insert({
        user_id: recipientId,
        conversation_id: conversationId,
        channel: 'email',
        status: 'skipped',
      })
      return
    }

    // Check cooldown: was a notification sent recently for this conversation?
    const cooldownThreshold = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString()
    const { data: recentNotif } = await supabase
      .from('notification_log')
      .select('id')
      .eq('user_id', recipientId)
      .eq('conversation_id', conversationId)
      .eq('channel', 'email')
      .eq('status', 'sent')
      .gt('created_at', cooldownThreshold)
      .limit(1)
      .single()

    if (recentNotif) {
      // Within cooldown — skip
      await supabase.from('notification_log').insert({
        user_id: recipientId,
        conversation_id: conversationId,
        channel: 'email',
        status: 'skipped',
      })
      return
    }

    // Get recipient email
    const { data: recipientUser } = await supabase
      .from('users')
      .select('email')
      .eq('id', recipientId)
      .single()

    if (!recipientUser?.email) return

    // Send the email
    await sendEmail({
      to: recipientUser.email,
      type: 'new_message',
      data: {
        sender_name: senderName,
        job_title: jobTitle,
        message_preview: messagePreview,
        conversation_url: `/messages/${conversationId}`,
      },
    })

    // Log as sent
    await supabase.from('notification_log').insert({
      user_id: recipientId,
      conversation_id: conversationId,
      channel: 'email',
      status: 'sent',
    })
  } catch (err) {
    console.error('[sendMessageNotification] error:', err)
    // Log as failed
    try {
      await supabase.from('notification_log').insert({
        user_id: recipientId,
        conversation_id: conversationId,
        channel: 'email',
        status: 'failed',
      })
    } catch { /* swallow */ }
  }
}
