import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export async function deliverReminder(admin: SupabaseClient, id: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) throw new Error('Email provider is not configured; reminder retained')
  const { data: claimed, error } = await admin.rpc('claim_reminder', { p_id: id })
  if (error) throw error
  const mail = claimed?.[0]
  if (!mail) return false
  const result = await sendEmail({ to: mail.recipient, type: mail.email_type, data: mail.template_data, idempotencyKey: mail.id })
  if (!result.ok) {
    const { error: releaseError } = await admin.from('email_outbox').update({ status: 'pending', claimed_until: null })
      .eq('id', mail.id).eq('claim_token', mail.claim_token).eq('status', 'sending')
    if (releaseError) throw releaseError
    throw new Error('Reminder delivery failed; retained for retry')
  }
  const { error: finishError } = await admin.rpc('finish_reminder', {
    p_id: mail.id, p_token: mail.claim_token, p_provider_id: result.id,
  })
  if (finishError) throw finishError
  return true
}

export async function sendReminder(admin: SupabaseClient, input: {
  userId: string; to: string; type: string; data?: Record<string, unknown>;
}): Promise<boolean> {
  const id = `${input.type}:${input.userId}`
  // Never change a previously queued payload: retries must reuse the same provider request.
  const { error } = await admin.from('email_outbox').upsert({
    id, user_id: input.userId, recipient: input.to, email_type: input.type, template_data: input.data || {},
  }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error
  return deliverReminder(admin, id)
}
