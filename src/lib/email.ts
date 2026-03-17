import { Resend } from 'resend'

const FROM_ADDRESS = 'JobLinks <notifications@joblinkantigua.com>'

export const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://joblinkantigua.com'

interface SendEmailParams {
  to: string
  type: string
  data?: Record<string, unknown>
}

/**
 * Fire-and-forget email helper.
 * Calls Resend directly (server-side only).
 * Never throws — logs errors instead so email failures don't break user flows.
 */
export async function sendEmail({ to, type, data }: SendEmailParams): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn(`[sendEmail] RESEND_API_KEY not set — skipping "${type}" email to ${to}`)
      return
    }

    // Dynamic import to keep the email builder co-located with the helper
    const { buildEmailHtml } = await import('./email-templates')

    const { subject, html } = buildEmailHtml(type, data || {})

    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    })

    if (error) {
      console.error(`[sendEmail] Failed "${type}" to ${to}:`, error.message)
    }
  } catch (err) {
    console.error(`[sendEmail] ${type} to ${to} error:`, err)
  }
}
