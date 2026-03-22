import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Resend Inbound Email Webhook
 *
 * Receives inbound emails from Resend and forwards them to the admin Gmail.
 * Handles emails sent to notifications@ and support@joblinkantigua.com.
 *
 * Resend webhook payload structure for email.received:
 * {
 *   "type": "email.received",
 *   "created_at": "...",
 *   "data": {
 *     "from": "sender@example.com",
 *     "to": ["support@joblinkantigua.com"],
 *     "subject": "Hello",
 *     "email_id": "...",
 *     "cc": [],
 *     "bcc": [],
 *     "attachments": []
 *   }
 * }
 *
 * Note: The webhook only includes metadata. To get the full email body,
 * we fetch it from the Resend Received Emails API using the email_id.
 */

const FORWARD_TO = 'jujulaville8@gmail.com'
const FROM_ADDRESS = 'JobLink Forwarding <notifications@joblinkantigua.com>'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    // Resend wraps email data inside a "data" object
    const eventData = payload.data
    if (!eventData) {
      console.error('[inbound-webhook] No data in webhook payload')
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const {
      from: senderFrom,
      to: recipientTo,
      subject,
      email_id: emailId,
    } = eventData

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('[inbound-webhook] RESEND_API_KEY not set')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const resend = new Resend(apiKey)

    // Fetch the full email body from Resend's Receiving API
    // Retry with delay because the webhook can fire before the body is available
    let emailBody = ''
    let emailHtml: string | undefined
    if (emailId) {
      const MAX_ATTEMPTS = 3
      const DELAY_MS = 2000

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          // Wait before fetching to give Resend time to process the email body
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS))

          const { data: emailDetail, error: fetchError } = await resend.emails.receiving.get(emailId)

          if (fetchError) {
            console.error(`[inbound-webhook] Resend receiving API error (attempt ${attempt}/${MAX_ATTEMPTS}):`, fetchError)
          } else if (emailDetail) {
            emailBody = emailDetail.text || ''
            emailHtml = emailDetail.html || undefined
            console.log(`[inbound-webhook] Fetched email body (attempt ${attempt}): text=${emailBody.length} chars, html=${emailHtml ? emailHtml.length : 0} chars`)

            // If we got content, stop retrying
            if (emailBody || emailHtml) break
            console.warn(`[inbound-webhook] Empty body on attempt ${attempt}/${MAX_ATTEMPTS}, retrying...`)
          } else {
            console.warn(`[inbound-webhook] No email detail returned (attempt ${attempt}/${MAX_ATTEMPTS}) for id:`, emailId)
          }
        } catch (fetchErr) {
          console.error(`[inbound-webhook] Could not fetch email body (attempt ${attempt}/${MAX_ATTEMPTS}):`, fetchErr)
        }
      }
    } else {
      console.warn('[inbound-webhook] No email_id in webhook payload, cannot fetch body')
    }

    // Build a forwarded subject line
    const recipientAddress = Array.isArray(recipientTo)
      ? recipientTo.join(', ')
      : (recipientTo || 'unknown')
    const forwardedSubject = `[Fwd: ${recipientAddress}] ${subject || '(no subject)'}`

    // Build the forwarded body
    const forwardHeader = [
      '--- Forwarded Email ---',
      `From: ${senderFrom || 'unknown'}`,
      `To: ${recipientAddress}`,
      `Subject: ${subject || '(no subject)'}`,
      '---',
      '',
    ].join('\n')

    const forwardedHtml = emailHtml
      ? `<div style="padding:12px;margin-bottom:16px;background:#f5f5f5;border-left:4px solid #0070f3;font-family:monospace;font-size:13px;">
          <strong>Forwarded Email</strong><br/>
          <strong>From:</strong> ${senderFrom || 'unknown'}<br/>
          <strong>To:</strong> ${recipientAddress}<br/>
          <strong>Subject:</strong> ${subject || '(no subject)'}
        </div>
        ${emailHtml}`
      : `<div style="padding:12px;margin-bottom:16px;background:#f5f5f5;border-left:4px solid #0070f3;font-family:monospace;font-size:13px;">
          <strong>Forwarded Email</strong><br/>
          <strong>From:</strong> ${senderFrom || 'unknown'}<br/>
          <strong>To:</strong> ${recipientAddress}<br/>
          <strong>Subject:</strong> ${subject || '(no subject)'}
        </div>
        <pre>${emailBody || '(no body)'}</pre>`

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: FORWARD_TO,
      subject: forwardedSubject,
      html: forwardedHtml,
      text: forwardHeader + (emailBody || '(no body)'),
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
