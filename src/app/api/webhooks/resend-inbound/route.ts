import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

const FORWARD_TO = 'jujulaville8@gmail.com'
const FROM_ADDRESS = 'JobLink Forwarding <notifications@joblinkantigua.com>'

export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET

  if (!apiKey) {
    console.error('[inbound-webhook] RESEND_API_KEY not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (!webhookSecret) {
    console.error('[inbound-webhook] RESEND_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  try {
    const payload = await request.text()
    const id = request.headers.get('svix-id')
    const timestamp = request.headers.get('svix-timestamp')
    const signature = request.headers.get('svix-signature')

    if (!id || !timestamp || !signature) {
      return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 })
    }

    const resend = new Resend(apiKey)

    // Throws if webhook is invalid
    const event = resend.webhooks.verify({
      payload,
      headers: {
        id,
        timestamp,
        signature,
      },
      webhookSecret,
    })

    if (event.type !== 'email.received') {
      return NextResponse.json({ status: 'ignored', type: event.type })
    }

    const webhookData = event.data
    const senderFrom = webhookData.from || 'unknown'
    const recipientTo = Array.isArray(webhookData.to)
      ? webhookData.to.join(', ')
      : (webhookData.to || 'unknown')
    const subject = webhookData.subject || '(no subject)'
    const emailId = webhookData.email_id

    let emailText = ''
    let emailHtml = ''

    if (emailId) {
      await new Promise((resolve) => setTimeout(resolve, 3000))

      try {
        const { data } = await resend.emails.receiving.get(emailId)
        if (data) {
          emailText = data.text || ''
          emailHtml = data.html || ''
        }
      } catch (sdkErr) {
        console.error('[inbound-webhook] Failed to fetch inbound email body:', sdkErr)
      }
    }

    const forwardedSubject = `[Fwd: ${recipientTo}] ${subject}`

    const headerBlock = `<div style="padding:12px;margin-bottom:16px;background:#f5f5f5;border-left:4px solid #0070f3;font-family:monospace;font-size:13px;">
      <strong>Forwarded Email</strong><br/>
      <strong>From:</strong> ${senderFrom}<br/>
      <strong>To:</strong> ${recipientTo}<br/>
      <strong>Subject:</strong> ${subject}
    </div>`

    const forwardedHtml = emailHtml
      ? `${headerBlock}${emailHtml}`
      : `${headerBlock}<pre>${emailText || '(no body)'}</pre>`

    const forwardedText = [
      '--- Forwarded Email ---',
      `From: ${senderFrom}`,
      `To: ${recipientTo}`,
      `Subject: ${subject}`,
      '---',
      '',
      emailText || '(no body)',
    ].join('\n')

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: FORWARD_TO,
      subject: forwardedSubject,
      html: forwardedHtml,
      text: forwardedText,
    })

    if (error) {
      console.error('[inbound-webhook] Forward failed:', error.message)
      return NextResponse.json({ error: 'Forward failed' }, { status: 500 })
    }

    return NextResponse.json({ status: 'forwarded' })
  } catch (err) {
    console.error('[inbound-webhook] Error:', err)
    return NextResponse.json({ error: 'Invalid webhook or internal error' }, { status: 400 })
  }
}
