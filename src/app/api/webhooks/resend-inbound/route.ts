import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

const FORWARD_TO = 'jujulaville8@gmail.com'
const FROM_ADDRESS = 'JobLink Forwarding <notifications@joblinkantigua.com>'

export async function POST(request: NextRequest) {
  try {
    const event = await request.json()

    console.log('[inbound-webhook] Raw payload:', JSON.stringify(event, null, 2))

    if (event.type !== 'email.received') {
      return NextResponse.json({ status: 'ignored', type: event.type })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('[inbound-webhook] RESEND_API_KEY not set')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const resend = new Resend(apiKey)
    const webhookData = event.data

    const senderFrom = webhookData.from || 'unknown'
    const recipientTo = Array.isArray(webhookData.to)
      ? webhookData.to.join(', ')
      : (webhookData.to || 'unknown')
    const subject = webhookData.subject || '(no subject)'
    const emailId = webhookData.email_id

    // Fetch the full email body using the official Resend pattern
    let emailText = ''
    let emailHtml = ''

    if (emailId) {
      // Wait a moment for Resend to finish processing
      await new Promise((resolve) => setTimeout(resolve, 3000))

      try {
        const { data: email, error: fetchError } = await resend.emails.receiving.get(emailId)

        console.log('[inbound-webhook] Receiving API response:', JSON.stringify({ email, fetchError }, null, 2))

        if (fetchError) {
          console.error('[inbound-webhook] Receiving API error:', fetchError)
        } else if (email) {
          emailText = email.text || ''
          emailHtml = email.html || ''
        }
      } catch (err) {
        console.error('[inbound-webhook] Receiving API exception:', err)

        // Fallback: try raw fetch to the Resend API
        try {
          const rawRes = await fetch('https://api.resend.com/emails/receiving', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email_id: emailId }),
          })
          const rawBody = await rawRes.text()
          console.log('[inbound-webhook] Raw API response:', rawRes.status, rawBody)

          if (rawRes.ok) {
            const parsed = JSON.parse(rawBody)
            emailText = parsed.text || ''
            emailHtml = parsed.html || ''
          }
        } catch (rawErr) {
          console.error('[inbound-webhook] Raw fetch also failed:', rawErr)
        }
      }
    } else {
      console.warn('[inbound-webhook] No email_id in payload')
    }

    console.log(`[inbound-webhook] Body result: text=${emailText.length} chars, html=${emailHtml.length} chars`)

    // Build forwarded email
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

    console.log(`[inbound-webhook] Forwarded from ${senderFrom} to ${FORWARD_TO}`)
    return NextResponse.json({ status: 'forwarded' })
  } catch (err) {
    console.error('[inbound-webhook] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
