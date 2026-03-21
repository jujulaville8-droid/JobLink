import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Resend Inbound Email Webhook
 *
 * Receives inbound emails from Resend and forwards them to the admin Gmail.
 * Handles emails sent to notifications@ and support@joblinkantigua.com.
 */

const FORWARD_TO = 'jujulaville8@gmail.com'
const FROM_ADDRESS = 'JobLink Forwarding <notifications@joblinkantigua.com>'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    const {
      from: senderFrom,
      to: recipientTo,
      subject,
      text,
      html,
    } = payload

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('[inbound-webhook] RESEND_API_KEY not set')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const resend = new Resend(apiKey)

    // Build a forwarded subject line
    const recipientAddress = Array.isArray(recipientTo)
      ? recipientTo.join(', ')
      : recipientTo
    const forwardedSubject = `[Fwd: ${recipientAddress}] ${subject || '(no subject)'}`

    // Build the forwarded body
    const forwardHeader = [
      '--- Forwarded Email ---',
      `From: ${senderFrom}`,
      `To: ${recipientAddress}`,
      `Subject: ${subject || '(no subject)'}`,
      '---',
      '',
    ].join('\n')

    const forwardedHtml = html
      ? `<div style="padding:12px;margin-bottom:16px;background:#f5f5f5;border-left:4px solid #0070f3;font-family:monospace;font-size:13px;">
          <strong>Forwarded Email</strong><br/>
          <strong>From:</strong> ${senderFrom}<br/>
          <strong>To:</strong> ${recipientAddress}<br/>
          <strong>Subject:</strong> ${subject || '(no subject)'}
        </div>
        ${html}`
      : undefined

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: FORWARD_TO,
      subject: forwardedSubject,
      html: forwardedHtml,
      text: forwardHeader + (text || ''),
    })

    if (error) {
      console.error('[inbound-webhook] Failed to forward email:', error.message)
      return NextResponse.json({ error: 'Forward failed' }, { status: 500 })
    }

    console.log(`[inbound-webhook] Forwarded email from ${senderFrom} (${recipientAddress}) to ${FORWARD_TO}`)
    return NextResponse.json({ status: 'forwarded' })
  } catch (err) {
    console.error('[inbound-webhook] Error processing inbound email:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
