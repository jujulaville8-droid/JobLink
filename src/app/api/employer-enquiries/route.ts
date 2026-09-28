import { after, NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp } from '@/lib/rate-limit'
import { enquirySchema } from '@/lib/employer-pilot'
import { notifyEmployerEnquiry } from '@/lib/employer-enquiry-notifications'

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get('content-length')) > 24000) return NextResponse.json({ error: 'Please keep your request under 6,000 characters.' }, { status: 413 })
    const text = await request.text()
    if (Buffer.byteLength(text) > 24000) return NextResponse.json({ error: 'Request is too long.' }, { status: 413 })
    const body = enquirySchema.safeParse(JSON.parse(text))
    if (!body.success) return NextResponse.json({ error: 'Please check your contact details, describe the vacancy in at least 20 characters, and agree to be contacted.' }, { status: 400 })
    if (body.data.website) return NextResponse.json({ success: true })
    const db = createAdminClient()
    // Public writes fail closed if the shared rate limiter is unavailable.
    for (const [kind, value, limit] of [['ip', clientIp(request), 5], ['email', body.data.email, 3]] as const) {
      const hash = createHash('sha256').update(value).digest('hex')
      const { data, error } = await db.rpc('consume_rate_limit', { p_bucket: `employer-enquiry:${kind}:${hash}`, p_limit: limit, p_window_seconds: 3600 })
      const result = Array.isArray(data) ? data[0] : data
      if (error || !result) return NextResponse.json({ error: 'Requests are temporarily unavailable. Please email hello@joblinkantigua.com.' }, { status: 503 })
      if (!result.allowed) return NextResponse.json({ error: 'Too many requests. Please try later or email hello@joblinkantigua.com.' }, { status: 429, headers: { 'Retry-After': String(result.retry_after_seconds || 3600) } })
    }
    const { website: _honeypot, ...fields } = body.data
    void _honeypot
    const { error } = await db.from('employer_enquiries').insert(fields)
    // Repeated submission of the same opaque ID must not create another lead or notification.
    if (error?.code === '23505') return NextResponse.json({ success: true })
    if (error) return NextResponse.json({ error: 'Could not save your request. Please try again or email hello@joblinkantigua.com.' }, { status: 503 })
    after(async () => { try { await notifyEmployerEnquiry(fields.id) } catch { console.error('[employer-enquiry] Notification queued for retry') } })
    return NextResponse.json({ success: true }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not process your request. Please check the form and try again.' }, { status: 400 })
  }
}
