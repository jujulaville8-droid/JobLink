import { z } from 'zod'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { employerBillingEnabled } from '@/lib/employer-billing/config'
import { campaignStats, evidenceStorage, sendCampaignProof, type CampaignRow } from '@/lib/employer-billing/campaigns'
import { billingJson, sameOrigin } from '@/lib/employer-billing/http'

export const maxDuration = 60

type Nested<T> = T | T[] | null
const first = <T,>(value: Nested<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value)

/** The billing queue: payments to match, campaigns to run, and the directory gate. */
export async function GET(request: Request) {
  if (!employerBillingEnabled()) return billingJson({ error: 'Not found' }, 404)
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const db = createAdminClient()
  const companyQuery = new URL(request.url).searchParams.get('company_q')
  if (companyQuery !== null) {
    const term = companyQuery.trim().slice(0, 80).replace(/[%_\\]/g, (c) => `\\${c}`)
    const { data } = await db.from('companies').select('id, company_name, contact_email').ilike('company_name', `%${term}%`).order('company_name').limit(10)
    return billingJson({ companies: data ?? [] })
  }
  const [settings, review, campaigns] = await Promise.all([
    db.from('employer_billing_settings').select('directory_gated, gated_at').maybeSingle(),
    db.from('employer_orders').select('id, offer, status, amount, customer_email, paid_at, review_reason, company_id, companies(company_name)')
      .eq('needs_review', true).order('paid_at', { ascending: true }).limit(100),
    db.from('spotlight_campaigns').select('*, companies(company_name), job_listings(title, status)')
      .neq('status', 'cancelled').order('created_at', { ascending: false }).limit(150),
  ])
  if (settings.error || review.error || campaigns.error) return billingJson({ error: 'Could not load the billing queue.' }, 503)
  const now = Date.now()
  const rows = await Promise.all((campaigns.data ?? []).map(async (row) => {
    const campaign = row as CampaignRow & { companies: Nested<{ company_name: string }>; job_listings: Nested<{ title: string; status: string }> }
    const live = campaign.status === 'live' && campaign.starts_at
    const ageHours = live ? (now - Date.parse(campaign.starts_at!)) / 3_600_000 : 0
    return {
      id: campaign.id, status: campaign.status, company: first(campaign.companies)?.company_name ?? 'Company',
      job_title: first(campaign.job_listings)?.title ?? 'Vacancy', job_id: campaign.job_id, job_status: first(campaign.job_listings)?.status ?? null,
      requested_start: campaign.requested_start, starts_at: campaign.starts_at, ends_at: campaign.ends_at, ended_reason: campaign.ended_reason,
      website_url: campaign.website_url, facebook_url: campaign.facebook_url, instagram_url: campaign.instagram_url,
      evidence_count: campaign.evidence_paths.length, proof_sent_at: campaign.proof_sent_at, edit_used_at: campaign.edit_used_at,
      day3_checked_at: campaign.day3_checked_at, report_sent_at: campaign.report_sent_at, needs_review: campaign.needs_review,
      // Proof is due once the placement goes live; overdue after a day without all three links.
      proof_overdue: !!live && ageHours > 24 && !campaign.proof_sent_at,
      day3_due: !!live && ageHours >= 72 && !campaign.day3_checked_at,
      stats: live || campaign.status === 'ended' ? await campaignStats(db, campaign) : null,
    }
  }))
  return billingJson({
    directoryGated: settings.data?.directory_gated === true,
    gatedAt: settings.data?.gated_at ?? null,
    orders: (review.data ?? []).map((order) => ({ ...order, company_name: first(order.companies as Nested<{ company_name: string }>)?.company_name ?? null, companies: undefined })),
    campaigns: rows,
  })
}

const https = z.string().trim().url().max(500).refine((value) => value.startsWith('https://'), 'Links must start with https://')
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign_order'), order_id: z.uuid(), company_id: z.uuid() }),
  z.object({ action: z.literal('schedule'), campaign_id: z.uuid() }),
  z.object({ action: z.literal('go_live'), campaign_id: z.uuid() }),
  z.object({ action: z.literal('save_proof'), campaign_id: z.uuid(), website_url: https.nullish(), facebook_url: https.nullish(), instagram_url: https.nullish() }),
  z.object({ action: z.literal('send_proof'), campaign_id: z.uuid() }),
  z.object({ action: z.literal('mark_day3'), campaign_id: z.uuid() }),
  z.object({ action: z.literal('mark_edit'), campaign_id: z.uuid() }),
  z.object({ action: z.literal('end'), campaign_id: z.uuid() }),
  z.object({ action: z.literal('cancel'), campaign_id: z.uuid() }),
  z.object({ action: z.literal('resolve_review'), campaign_id: z.uuid().optional(), order_id: z.uuid().optional() }),
  z.object({ action: z.literal('grant_credit'), company_id: z.uuid() }),
  z.object({ action: z.literal('set_directory_gate'), gated: z.boolean(), confirm: z.literal('NOTICE SENT').optional() }),
])

const errorText = (message: string) =>
  message.includes('campaign_not_startable') ? 'This Spotlight has already started or ended.'
  : message.includes('job_not_active') ? 'The vacancy is no longer live, so the Spotlight cannot start.'
  : message.includes('campaign_started') ? 'This Spotlight has already gone live and cannot be cancelled. End it instead.'
  : message.includes('order_already_assigned') ? 'This payment is already assigned to another company.'
  : message.includes('order_not_paid') ? 'Only paid orders can be assigned.'
  : 'That change could not be saved.'

/** Every queue action, plus screenshot uploads (multipart). Admins only. */
export async function POST(request: Request) {
  if (!employerBillingEnabled()) return billingJson({ error: 'Not found' }, 404)
  if (!sameOrigin(request)) return billingJson({ error: 'Invalid request.' }, 400)
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const db = createAdminClient()

  // Screenshot upload: re-saved as PNG so no hidden data comes along, stored privately.
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const form = await request.formData()
    const campaignId = z.uuid().safeParse(form.get('campaign_id'))
    const file = form.get('file')
    if (!campaignId.success || !(file instanceof File) || file.size > 5 * 1024 * 1024) return billingJson({ error: 'Choose a screenshot up to 5 MB.' }, 400)
    const { data: campaign } = await db.from('spotlight_campaigns').select('id, evidence_paths').eq('id', campaignId.data).maybeSingle()
    if (!campaign) return billingJson({ error: 'Not found' }, 404)
    if (campaign.evidence_paths.length >= 6) return billingJson({ error: 'Up to six screenshots per Spotlight.' }, 400)
    let png: Buffer
    try { png = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().png().toBuffer() }
    catch { return billingJson({ error: 'That file is not a readable image.' }, 400) }
    const path = `${campaign.id}/${randomUUID()}.png`
    const storage = await evidenceStorage(db)
    const stored = await storage.upload(path, png, { contentType: 'image/png', upsert: false })
    if (stored.error) return billingJson({ error: 'The screenshot could not be stored.' }, 503)
    const { error } = await db.from('spotlight_campaigns').update({ evidence_paths: [...campaign.evidence_paths, path] }).eq('id', campaign.id)
    if (error) { await storage.remove([path]); return billingJson({ error: 'The screenshot could not be saved.' }, 503) }
    return billingJson({ success: true })
  }

  const parsed = action.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return billingJson({ error: parsed.error.issues[0]?.message || 'Invalid request.' }, 400)
  const input = parsed.data
  const now = new Date().toISOString()
  const fail = (message: string) => billingJson({ error: errorText(message) }, 409)

  switch (input.action) {
    case 'assign_order': {
      const { error } = await db.rpc('assign_employer_order', { p_order_id: input.order_id, p_company_id: input.company_id, p_actor_id: auth.user.id })
      return error ? fail(error.message) : billingJson({ success: true })
    }
    case 'schedule': {
      const { error } = await db.from('spotlight_campaigns').update({ status: 'scheduled' }).eq('id', input.campaign_id).eq('status', 'requested')
      return error ? fail(error.message) : billingJson({ success: true })
    }
    case 'go_live': {
      const { data, error } = await db.rpc('start_spotlight_campaign', { p_campaign_id: input.campaign_id })
      return error ? fail(error.message) : billingJson({ success: true, ...(data as object) })
    }
    case 'save_proof': {
      const update = Object.fromEntries(Object.entries({ website_url: input.website_url, facebook_url: input.facebook_url, instagram_url: input.instagram_url })
        .filter(([, value]) => value !== undefined))
      const { error } = await db.from('spotlight_campaigns').update(update).eq('id', input.campaign_id).in('status', ['scheduled', 'live', 'ended'])
      return error ? fail(error.message) : billingJson({ success: true })
    }
    case 'send_proof': {
      const { data } = await db.from('spotlight_campaigns').select('*').eq('id', input.campaign_id).maybeSingle()
      if (!data || data.status !== 'live') return billingJson({ error: 'Only a live Spotlight can send its proof.' }, 409)
      if (!data.website_url || !data.facebook_url || !data.instagram_url) return billingJson({ error: 'Add all three links first.' }, 400)
      return (await sendCampaignProof(db, data as CampaignRow)) ? billingJson({ success: true }) : billingJson({ error: 'The email could not be sent.' }, 503)
    }
    case 'mark_day3': {
      const { error } = await db.from('spotlight_campaigns').update({ day3_checked_at: now }).eq('id', input.campaign_id).eq('status', 'live')
      return error ? fail(error.message) : billingJson({ success: true })
    }
    case 'mark_edit': {
      // One approved edit and re-share per campaign.
      const { data, error } = await db.from('spotlight_campaigns').update({ edit_used_at: now }).eq('id', input.campaign_id)
        .eq('status', 'live').is('edit_used_at', null).select('id').maybeSingle()
      if (error) return fail(error.message)
      return data ? billingJson({ success: true }) : billingJson({ error: 'The one included edit has already been used.' }, 409)
    }
    case 'end': {
      const { error } = await db.rpc('end_spotlight_campaign', { p_campaign_id: input.campaign_id, p_reason: 'manual' })
      return error ? fail(error.message) : billingJson({ success: true })
    }
    case 'cancel': {
      const { error } = await db.rpc('cancel_spotlight_campaign', { p_campaign_id: input.campaign_id })
      return error ? fail(error.message) : billingJson({ success: true })
    }
    case 'resolve_review': {
      if (input.campaign_id) await db.from('spotlight_campaigns').update({ needs_review: false }).eq('id', input.campaign_id)
      if (input.order_id) {
        const { data } = await db.from('employer_orders').select('company_id').eq('id', input.order_id).maybeSingle()
        // An unassigned payment is resolved by assigning it, not by dismissing it.
        if (!data?.company_id) return billingJson({ error: 'Assign this payment to a company first.' }, 409)
        await db.from('employer_orders').update({ needs_review: false, updated_at: now }).eq('id', input.order_id)
      }
      return billingJson({ success: true })
    }
    case 'grant_credit': {
      const { error } = await db.from('spotlight_credits').insert({ company_id: input.company_id, source: 'manual', granted_by: auth.user.id })
      return error ? fail(error.message) : billingJson({ success: true })
    }
    case 'set_directory_gate': {
      if (input.gated && input.confirm !== 'NOTICE SENT') {
        return billingJson({ error: 'Confirm that existing employers have been told before restricting the directory.' }, 400)
      }
      const { error } = await db.from('employer_billing_settings')
        .update({ directory_gated: input.gated, gated_at: input.gated ? now : null, gated_by: input.gated ? auth.user.id : null }).eq('id', true)
      return error ? fail(error.message) : billingJson({ success: true })
    }
  }
}
