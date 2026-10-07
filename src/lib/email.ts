import { Resend } from 'resend'

const FROM_ADDRESS = 'JobLinks <notifications@joblinkantigua.com>'

export const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://joblinkantigua.com'

interface SendEmailParams {
  to: string
  type: string
  data?: Record<string, unknown>
  idempotencyKey?: string
  replyTo?: string
  /** Private file bytes only; never ask the provider to fetch a storage URL. */
  attachments?: { filename: string; content: Buffer; contentType: string }[]
}

/**
 * Reports provider acceptance, not inbox delivery.
 * Calls Resend directly (server-side only).
 * Never throws — logs errors instead so email failures don't break user flows.
 */
export async function sendEmail({ to, type, data, idempotencyKey, replyTo, attachments }: SendEmailParams): Promise<{ success: true; id: string } | { success: false }> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn(`[sendEmail] RESEND_API_KEY not set — skipping "${type}" email`)
      return { success: false }
    }

    // Dynamic import to keep the email builder co-located with the helper
    const { buildEmailHtml } = await import('./email-templates')

    const { subject, html } = buildEmailHtml(type, data || {})

    const resend = new Resend(apiKey)
    const { data: sent, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}),
    }, idempotencyKey ? { idempotencyKey } : undefined)

    if (error) {
      console.error(`[sendEmail] Provider rejected "${type}" email`)
    }
    return !error && sent?.id ? { success: true, id: sent.id } : { success: false }
  } catch {
    // Provider errors can contain recipient addresses or private attachment data.
    console.error(`[sendEmail] Failed "${type}" email`)
    return { success: false }
  }
}
