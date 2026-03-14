const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://joblinkantigua.com'

interface SendEmailParams {
  to: string
  type: string
  data?: Record<string, unknown>
}

/**
 * Fire-and-forget email helper.
 * Calls the internal /api/send-email route.
 * Never throws — logs errors instead so email failures don't break user flows.
 */
export async function sendEmail({ to, type, data }: SendEmailParams): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, type, data }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error(`[sendEmail] ${type} to ${to} failed:`, body)
    }
  } catch (err) {
    console.error(`[sendEmail] ${type} to ${to} error:`, err)
  }
}

export { BASE_URL }
