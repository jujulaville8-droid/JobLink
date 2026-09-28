import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { caseSnippet, escapeHtml } from './testimonial-content'

const SITE = 'https://joblinkantigua.com'

export function requestDeliveryStatus(sentAt: string | null, startedAt: string | null) {
  if (sentAt) return 'sent'
  if (startedAt && Date.now() - Date.parse(startedAt) > 23 * 3600000) return 'delivery uncertain — check Resend; automatic retries stopped'
  return 'queued'
}

export async function requestTestimonial(id: string) {
  if (!process.env.RESEND_API_KEY) return false
  const db = createAdminClient()
  const { data: placement, error } = await db.from('placements').select('*').eq('id', id).single()
  if (error) throw error
  if (placement.request_sent_at || placement.feedback) return true
  // Stop uncertain retries before the provider's 24-hour idempotency window ends.
  if (placement.request_started_at && Date.now() - Date.parse(placement.request_started_at) > 23 * 3600000) return false
  if (!placement.request_started_at) {
    const { data: user, error: userError } = await db.from('users').select('email, is_banned').eq('id', placement.employer_id).single()
    if (userError) throw userError
    if (!user?.email || user.is_banned) return false
    const { data: claimed, error: claimError } = await db.from('placements')
      .update({ request_started_at: new Date().toISOString(), request_email: user.email })
      .eq('id', id).is('request_started_at', null).select('id').maybeSingle()
    if (claimError) throw claimError
    if (!claimed) return false
    placement.request_email = user.email
  }
  const { data, error: sendError } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'JobLinks <notifications@joblinkantigua.com>',
    to: placement.request_email,
    subject: 'How did your JobLinks hire go?',
    html: `<h1>Congratulations on your hire!</h1><p>You confirmed a hire for ${escapeHtml(placement.job_title)} at ${escapeHtml(placement.company_name)}.</p><p>Would you share one or two sentences about your experience? Feedback is optional. We will only publish it or use it in outreach with your permission.</p><p><a href="${SITE}/placement-feedback/${id}">Share your experience</a> (sign in to your employer account).</p><p>Thank you,<br>JobLinks Antigua</p>`,
  }, { idempotencyKey: `placement-testimonial/${id}` })
  if (sendError || !data?.id) return false
  const { error: saveError } = await db.from('placements').update({ request_sent_at: new Date().toISOString() }).eq('id', id)
  if (saveError) throw saveError
  return true
}

export async function approvedTestimonials() {
  const { data, error } = await createAdminClient().from('placements')
    .select('id, company_name, job_title, feedback').eq('review_status', 'approved').eq('consent', true)
    .gte('rating', 4).order('updated_at', { ascending: false }).limit(6)
  if (error) throw error
  return data ?? []
}

export async function outreachProof() {
  const stories = await approvedTestimonials()
  if (!stories.length) return ''
  const story = stories[Math.floor(Math.random() * stories.length)]
  return `<section style="padding:20px;background:#f0fafa;margin:20px 0"><h3>A local hiring story</h3><p>${escapeHtml(story.company_name)} · ${escapeHtml(story.job_title)}</p><blockquote>“${escapeHtml(caseSnippet(story.feedback!))}”</blockquote><a href="${SITE}/success-stories">More hiring stories</a></section>`
}
