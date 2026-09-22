import { Resend } from 'resend'
const FROM_ADDRESS = 'JobLinks <notifications@joblinkantigua.com>'
export const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://joblinkantigua.com'
interface SendEmailParams { to: string; type: string; data?: Record<string, unknown>; idempotencyKey?: string }
export type EmailResult = { ok: true; id: string } | { ok: false }

/** Explicit result: callers must not record delivery when a provider call failed. */
export async function sendEmail({ to, type, data, idempotencyKey }: SendEmailParams): Promise<EmailResult> {
  try {
    if (!process.env.RESEND_API_KEY) return { ok: false }
    const { buildEmailHtml } = await import('./email-templates')
    const { subject, html } = buildEmailHtml(type, data || {})
    const { data: result, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM_ADDRESS, to, subject, html,
    }, idempotencyKey ? { idempotencyKey } : undefined)
    if (error || !result?.id) {
      console.error('[sendEmail] Provider rejected', type, error?.name)
      return { ok: false }
    }
    return { ok: true, id: result.id }
  } catch {
    console.error('[sendEmail] Delivery failed', type)
    return { ok: false }
  }
}
