import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeHtml } from '@/lib/testimonial-content'

export async function notifyEmployerEnquiry(id: string) {
  if (!process.env.RESEND_API_KEY) return false
  const db = createAdminClient()
  const { data: row, error } = await db.from('employer_enquiries').select('*').eq('id', id).single()
  if (error) throw error
  if (row.notification_sent_at) return true
  if (row.notification_started_at && Date.now() - Date.parse(row.notification_started_at) > 23 * 3600000) return false
  if (!row.notification_started_at) {
    const { data, error: claimError } = await db.from('employer_enquiries')
      .update({ notification_started_at: new Date().toISOString() }).eq('id', id).is('notification_started_at', null).select('id').maybeSingle()
    if (claimError) throw claimError
    if (!data) return false
  }
  // Fixed recipient prevents this public form from becoming an email relay.
  // Keep status/notes out of the message so retries have an identical payload.
  const { data, error: sendError } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'JobLinks <notifications@joblinkantigua.com>',
    to: 'hello@joblinkantigua.com',
    replyTo: row.email,
    subject: 'New employer vacancy request — JobLinks',
    html: `<h1>A business has asked for hiring help</h1><p><strong>${escapeHtml(row.company_name)}</strong> — ${escapeHtml(row.job_title)}</p><p>Contact: ${escapeHtml(row.contact_name)} (${escapeHtml(row.email)})</p><p>Phone: ${escapeHtml(row.phone || 'Not provided')}</p><p style="white-space:pre-wrap">${escapeHtml(row.details)}</p><p><a href="https://joblinkantigua.com/admin/employer-enquiries#${id}">Review this request</a></p><p>The employer has agreed to be contacted about this vacancy. Confirm the final wording and permission before publishing.</p>`,
  }, { idempotencyKey: `employer-enquiry/${id}` })
  if (sendError || !data?.id) return false
  const { error: saveError } = await db.from('employer_enquiries').update({ notification_sent_at: new Date().toISOString() }).eq('id', id)
  if (saveError) throw saveError
  return true
}
