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
 * user-scoped client. Re-read the persisted identity, body, own membership and
 * application ownership before any service-role access. Participant SELECT RLS
 * exposes only the caller, so a bounded server-only read verifies the full pair.
 * There is deliberately no recipient override or private data returned to routes.
 *
 * Participant INSERT currently allows arbitrary authenticated rows; membership
 * alone is not an authorization boundary. Direct threads have no independent
 * persisted invitation provenance and fail closed until that is available.
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

    // Production cp_select exposes only the caller's row. Bind that exact row
    // before using any privileged resolver; do not expect caller-visible peers.
    const { data: membership, error: membershipError } = await supabase.from('conversation_participants')
      .select('conversation_id, user_id, is_blocked')
      .eq('conversation_id', conversationId).eq('user_id', senderId).single()
    if (membershipError || membership?.conversation_id !== conversationId ||
      membership.user_id !== senderId || membership.is_blocked !== false) return

    // cp_insert permits arbitrary authenticated participant insertion. Require
    // an independent application relationship before any private roster read.
    // A direct thread has no trustworthy persisted invitation/ownership link.
    if (!conversation.application_id) return
    const { data: application, error: applicationError } = await supabase.from('applications')
      .select('id, seeker_id, job_id, seeker_profiles!inner(id, user_id), job_listings!inner(id, title, company_id, companies!inner(id, user_id))')
      .eq('id', conversation.application_id).single()
    const seeker = row(application?.seeker_profiles)
    const job = row(application?.job_listings)
    const applicationCompany = row(job?.companies)
    if (applicationError || application?.id !== conversation.application_id ||
      !seeker || !job || !applicationCompany || seeker.id !== application.seeker_id || job.id !== application.job_id ||
      applicationCompany.id !== job.company_id || !uuid(seeker.user_id) || !uuid(applicationCompany.user_id) ||
      seeker.user_id === applicationCompany.user_id ||
      ![seeker.user_id, applicationCompany.user_id].includes(senderId)) return
    const recipientId = senderId === seeker.user_id ? applicationCompany.user_id : seeker.user_id
    const jobTitle = label(job.title) || 'a position'

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
    // Read only this bound conversation's roster, with a third-row sentinel.
    // Neither RLS-visible membership nor application context replaces exact
    // two-person validation. No recipient settings/email are read before it.
    const { data: participants, error: participantsError } = await admin.from('conversation_participants')
      .select('conversation_id, user_id, is_blocked').eq('conversation_id', conversationId).limit(3)
    if (participantsError || !Array.isArray(participants) || participants.length !== 2 ||
      participants.some(p => p.conversation_id !== conversationId || !uuid(p.user_id) || typeof p.is_blocked !== 'boolean') ||
      participants.filter(p => p.user_id === senderId).length !== 1 ||
      participants.filter(p => p.user_id === recipientId).length !== 1) return
    // Recheck the sender's block flag at the privileged roster read. Blocking
    // remains directional: the blocker may still send to their blocked peer.
    if (participants.find(p => p.user_id === senderId)!.is_blocked) return

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
