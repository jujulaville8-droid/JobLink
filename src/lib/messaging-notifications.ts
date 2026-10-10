import 'server-only'
import { sendEmail } from '@/lib/email'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseCompanyContactEmail } from '@/lib/company-contact-email'
import type { SupabaseClient } from '@supabase/supabase-js'

interface NotificationParams {
  messageId: string
  conversationId: string
  /** The authenticated sender from requireVerifiedUser, never a request-body ID. */
  senderId: string
}

type Row = Record<string, unknown>
const row = (value: unknown): Row | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const label = (value: unknown): string => typeof value === 'string' ? value.trim().slice(0, 200) : ''

/**
 * Called only after a message write succeeds, using the authenticated sender's
 * user-scoped client. Re-read the persisted identity, body and participants
 * before any service-role access. There is deliberately no recipient override.
 *
 * Private reads are confined to recipient delivery settings/email and the
 * notification log; no private notification context is returned to the route.
 * Failures never undo a saved message. Cooldown is best-effort, not an atomic
 * delivery claim; the provider key also deduplicates retries of this message
 * within the provider's idempotency window, not guaranteed exactly-once delivery.
 */
export async function sendMessageNotification(
  supabase: SupabaseClient,
  { messageId, conversationId, senderId }: NotificationParams,
): Promise<void> {
  // Local builds without an email key must not read private recipient records.
  if (!process.env.RESEND_API_KEY || !uuid(messageId) || !uuid(conversationId) || !uuid(senderId)) return

  try {
    const { data: message, error: messageError } = await supabase.from('messages')
      .select('id, conversation_id, sender_id, body')
      .eq('id', messageId).eq('conversation_id', conversationId).eq('sender_id', senderId).single()
    if (messageError || message?.id !== messageId || message.conversation_id !== conversationId ||
      message.sender_id !== senderId || typeof message.body !== 'string' || !message.body.trim()) return

    const { data: conversation, error: conversationError } = await supabase.from('conversations')
      .select('id, application_id').eq('id', conversationId).single()
    if (conversationError || conversation?.id !== conversationId ||
      (conversation.application_id !== null && !uuid(conversation.application_id))) return

    const { data: participants, error: participantsError } = await supabase.from('conversation_participants')
      .select('conversation_id, user_id, is_blocked').eq('conversation_id', conversationId).limit(3)
    if (participantsError || !Array.isArray(participants) || participants.length !== 2 ||
      participants.some(p => p.conversation_id !== conversationId || !uuid(p.user_id) || typeof p.is_blocked !== 'boolean')) return
    if (participants.filter(p => p.user_id === senderId).length !== 1) return
    // Blocking is directional: the blocked person's row disables their sends.
    // The blocker may still send; do not silently turn this into a mutual block.
    if (participants.find(p => p.user_id === senderId)!.is_blocked) return
    const recipientId: string = participants.find(p => p.user_id !== senderId)!.user_id

    let jobTitle = 'a position'
    if (conversation.application_id) {
      // Restrict application conversations to the persisted applicant and job
      // owner, even if legacy participant rows were populated incorrectly.
      const { data: application, error: applicationError } = await supabase.from('applications')
        .select('id, seeker_id, job_id, seeker_profiles!inner(id, user_id), job_listings!inner(id, title, company_id, companies!inner(id, user_id))')
        .eq('id', conversation.application_id).single()
      const seeker = row(application?.seeker_profiles)
      const job = row(application?.job_listings)
      const company = row(job?.companies)
      if (applicationError || application?.id !== conversation.application_id ||
        !seeker || !job || !company || seeker.id !== application.seeker_id || job.id !== application.job_id ||
        company.id !== job.company_id || !uuid(seeker.user_id) || !uuid(company.user_id) ||
        seeker.user_id === company.user_id ||
        ![seeker.user_id, company.user_id].includes(senderId) ||
        ![seeker.user_id, company.user_id].includes(recipientId)) return
      jobTitle = label(job.title) || jobTitle
    }

    const { data: sender, error: senderError } = await supabase.from('users')
      .select('id, is_banned').eq('id', senderId).single()
    if (senderError || sender?.id !== senderId || sender.is_banned !== false) return

    // Keep company-first display naming, including accounts that also retain
    // a seeker profile. Only sender-owned names are used, never the peer's RPC.
    const { data: company, error: companyError } = await supabase.from('companies')
      .select('user_id, company_name').eq('user_id', senderId).maybeSingle()
    if (companyError || (company && company.user_id !== senderId)) return
    let senderName = label(company?.company_name)
    if (!senderName) {
      const { data: profile, error: profileError } = await supabase.from('seeker_profiles')
        .select('user_id, first_name, last_name').eq('user_id', senderId).maybeSingle()
      if (profileError || (profile && profile.user_id !== senderId)) return
      senderName = [label(profile?.first_name), label(profile?.last_name)].filter(Boolean).join(' ').slice(0, 200)
    }

    const admin = createAdminClient()
    const { data: settings, error: settingsError } = await admin.from('user_messaging_settings')
      .select('email_notifications, notification_cooldown_minutes').eq('user_id', recipientId).maybeSingle()
    // Only a successful, empty result receives defaults. A denied/unavailable
    // settings read is not permission to email someone who may have opted out.
    if (settingsError) return
    const emailEnabled = settings ? settings.email_notifications : true
    const cooldownMinutes = settings ? settings.notification_cooldown_minutes : 5
    if (typeof emailEnabled !== 'boolean' || !Number.isInteger(cooldownMinutes) || cooldownMinutes < 1) return

    const log = async (status: 'sent' | 'failed' | 'skipped') => {
      try {
        const { error } = await admin.from('notification_log').insert({
          user_id: recipientId, conversation_id: conversationId, channel: 'email', status,
        })
        if (error) console.warn('[sendMessageNotification] Notification log unavailable')
      } catch { console.warn('[sendMessageNotification] Notification log unavailable') }
    }

    if (!emailEnabled) { await log('skipped'); return }

    const threshold = new Date(Date.now() - cooldownMinutes * 60 * 1000)
    if (!Number.isFinite(threshold.getTime())) return
    const { data: recent, error: recentError } = await admin.from('notification_log')
      .select('id').eq('user_id', recipientId).eq('conversation_id', conversationId)
      .eq('channel', 'email').eq('status', 'sent').gt('created_at', threshold.toISOString()).limit(1).maybeSingle()
    if (recentError) return
    if (recent) { await log('skipped'); return }

    const { data: recipient, error: recipientError } = await admin.from('users')
      .select('id, email, is_banned').eq('id', recipientId).single()
    if (recipientError || recipient?.id !== recipientId || recipient.is_banned !== false) return
    const address = parseCompanyContactEmail(recipient.email)
    if (!address.valid || !address.email) return

    try {
      const result = await sendEmail({
        to: address.email,
        type: 'new_message',
        idempotencyKey: `message/${messageId}/${recipientId}`,
        data: {
          sender_name: senderName || 'Someone',
          job_title: jobTitle,
          message_preview: message.body.trim().slice(0, 100),
          conversation_url: `/messages/${conversationId}`,
        },
      })
      // sendEmail reports provider acceptance, not inbox delivery.
      await log(result.success ? 'sent' : 'failed')
    } catch { await log('failed') }
  } catch {
    // Database/provider exceptions can include message bodies or email addresses.
    console.warn('[sendMessageNotification] Notification unavailable')
  }
}
