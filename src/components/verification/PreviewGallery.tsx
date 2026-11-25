'use client'

/**
 * Preview gallery for JobLink Verified.
 *
 * Renders the real components with made-up data by answering their API calls
 * in the browser. Nothing is read from or written to a database, no payment is
 * taken and no email is sent. Reached only at /preview/verified when
 * VERIFIED_PREVIEW=true.
 */
import { useEffect, useMemo, useState } from 'react'
import ApplyVerifiedDocuments from '@/components/verification/ApplyVerifiedDocuments'
import VerifiedDashboardCard from '@/components/verification/DashboardCard'
import VerificationPanel from '@/components/verification/VerificationPanel'
import VerificationReview from '@/components/verification/VerificationReview'
import VerifiedBadge, { PoliceRecordRequiredLabel } from '@/components/verification/VerifiedBadge'
import { VerifiedFlagProvider } from '@/components/verification/VerifiedFlag'
import { addMonths, antiguaToday } from '@/lib/verification/shared'
import EmployerBillingPanel from '@/components/employer-billing/EmployerBillingPanel'
import EmployerBillingAdmin from '@/components/employer-billing/EmployerBillingAdmin'
import ProUpgradePrompt from '@/components/employer-billing/ProUpgradePrompt'
import type { EmployerBillingSummary } from '@/lib/employer-billing/summary'

type Json = Record<string, unknown>
const today = antiguaToday()
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const inDays = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const ID = '0b0f6a0e-1111-4222-8333-444455556666'

const check = (overrides: Json = {}): Json => ({
  id: ID, status: 'approved', paid_at: ago(3), submitted_at: ago(2), reviewed_at: ago(1), rtw_group_claimed: 'citizen',
  rtw_group: 'citizen', rtw_document_type: 'passport', police_record_issued_on: today, verified_until: addMonths(today, 6),
  confirmation_code: 'ABCDEFGH23', sharing_notice: false, decision_reason: null, reupload_documents: [], refunded_at: null,
  has_rtw_file: false, has_police_record_file: true, valid: true, ...overrides,
})
const inProgress = (overrides: Json = {}) => check({
  status: 'paid', submitted_at: null, reviewed_at: null, rtw_group_claimed: null, rtw_group: null, rtw_document_type: null,
  police_record_issued_on: null, verified_until: null, confirmation_code: null, has_police_record_file: false, valid: false, ...overrides,
})
const shares = () => [
  { id: 'share-1', employer: 'Acme Security Ltd', job_title: 'Security Officer', share_police_record: true, share_rtw: true, shared_at: ago(4), revoked_at: null,
    views: [{ document: 'police_record', viewed_at: ago(1) }, { document: 'rtw', viewed_at: ago(2) }] },
  { id: 'share-2', employer: 'Confidential employer', job_title: 'Front Desk Agent', share_police_record: false, share_rtw: true, shared_at: ago(9), revoked_at: null, views: [] },
  { id: 'share-3', employer: 'Sunrise Daycare', job_title: 'Childcare Assistant', share_police_record: true, share_rtw: true, shared_at: ago(20), revoked_at: ago(6), views: [{ document: 'police_record', viewed_at: ago(15) }] },
]
const seeker = (overrides: Json): Json => ({ checkoutEnabled: true, uploadsOpen: true, open: null, badge: null, last: null, shares: [], name: 'Sam Seeker', ...overrides })
const queueItem = (id: string, name: string, hours: number, group = 'citizen'): Json => ({
  id, status: 'submitted', name, rtw_group_claimed: group, rtw_group: null, verified_until: null, submitted_at: new Date(Date.now() - hours * 3_600_000).toISOString(),
  reviewed_at: null, decision_reason: null, reupload_documents: [], refunded: false, has_rtw_file: true, has_police_record_file: true,
})
const queue = (uploadsOpen: boolean): Json => ({
  uploadsOpen, fileKeyReady: true, paidWaiting: uploadsOpen ? 0 : 3,
  waiting: uploadsOpen ? [queueItem('q1', 'Olive Other', 53, 'oecs_citizen'), queueItem('q2', 'Sam Seeker', 20), queueItem('q3', 'Wendell Permit', 4, 'work_permit')] : [],
  reupload: uploadsOpen ? [{ ...queueItem('q4', 'Tariq Thomas', 70), status: 'reupload_needed', decision_reason: 'photo_unreadable', reupload_documents: ['police_record'] }] : [],
  decided: uploadsOpen ? [
    { ...queueItem('q5', 'Gina George', 90), status: 'approved', verified_until: addMonths(today, 6), reviewed_at: ago(2) },
    { ...queueItem('q6', 'Marcus Mills', 120), status: 'not_approved', decision_reason: 'name_mismatch', refunded: true, reviewed_at: ago(3) },
  ] : [],
})

const billing = (overrides: Partial<EmployerBillingSummary>): Json => ({
  salesOpen: true, directoryGated: false,
  pro: { active: false, source: null, paidThrough: null, status: null, cancelAtPeriodEnd: false, manageable: false },
  credits: [], campaigns: [],
  jobs: [{ id: 'j1', title: 'Line Cook', booked: false }, { id: 'j2', title: 'Head Chef', booked: false }, { id: 'j3', title: 'Beach Waiter', booked: false }],
  claimable: [], ...overrides,
})
const campaignRow = (status: string) => ({
  id: `cmp-${status}`, job_id: status === 'live' ? 'j2' : 'j9', job_title: status === 'live' ? 'Head Chef' : status === 'ended' ? 'Steward' : 'Line Cook', status,
  requested_start: inDays(2), starts_at: status === 'requested' ? null : ago(status === 'live' ? 2 : 20), ends_at: status === 'requested' ? null : status === 'live' ? new Date(Date.now() + 5 * 86_400_000).toISOString() : ago(13),
  ended_reason: status === 'ended' ? 'completed' : null,
})
const adminCampaign = (id: string, status: string, overrides: Json = {}): Json => ({
  id, status, company: 'Treehouse Beach Club', job_title: 'Line Cook', job_id: ID, job_status: 'active', requested_start: inDays(1),
  starts_at: null, ends_at: null, ended_reason: null, website_url: null, facebook_url: null, instagram_url: null, evidence_count: 0,
  proof_sent_at: null, edit_used_at: null, day3_checked_at: null, report_sent_at: null, needs_review: false, proof_overdue: false, day3_due: false, stats: null, ...overrides,
})
const billingQueue = (): Json => ({
  directoryGated: false, gatedAt: null,
  orders: [{ id: 'o1', offer: 'spotlight', status: 'paid', amount: 12500, customer_email: 'manager@example.com', paid_at: ago(0.2), review_reason: 'unassigned', company_id: null, company_name: null }],
  campaigns: [
    adminCampaign('a1', 'requested'),
    adminCampaign('a2', 'live', { job_title: 'Head Chef', company: 'Sunrise Hotel', starts_at: ago(3.2), ends_at: new Date(Date.now() + 3.8 * 86_400_000).toISOString(), website_url: 'https://joblinkantigua.com/jobs/x', evidence_count: 1, proof_overdue: true, day3_due: true, stats: { views: 214, applications: 9 } }),
    adminCampaign('a3', 'ended', { job_title: 'Steward', starts_at: ago(15), ends_at: ago(8), ended_reason: 'completed', proof_sent_at: ago(14), report_sent_at: ago(8), stats: { views: 402, applications: 17 } }),
  ],
})

interface Scene { key: string; group: string; label: string; note: string; kind: 'seeker' | 'admin' | 'apply' | 'pieces' | 'billing' | 'billing-admin' | 'upgrade'; data: () => Json; justPaid?: boolean }

const SCENES: Scene[] = [
  { key: 'offer', group: 'Job seeker: /verification', label: 'Not started', kind: 'seeker', note: 'What a job seeker sees before paying. "Get verified" would open Stripe; here it jumps to the next step.', data: () => seeker({}) },
  { key: 'paid-locked', group: 'Job seeker: /verification', label: 'Paid, uploads locked', kind: 'seeker', note: 'The first buyers see this until you upgrade Supabase and open uploads.', data: () => seeker({ uploadsOpen: false, open: inProgress() }) },
  { key: 'paid-open', group: 'Job seeker: /verification', label: 'Paid, upload', kind: 'seeker', note: 'Consent box, group, then the two uploads. Choose any PDF or photo to try it; nothing is stored.', data: () => seeker({ open: inProgress() }) },
  { key: 'review', group: 'Job seeker: /verification', label: 'Under review', kind: 'seeker', note: '', data: () => seeker({ open: inProgress({ status: 'submitted', submitted_at: ago(0), rtw_group_claimed: 'citizen', has_rtw_file: true, has_police_record_file: true }) }) },
  { key: 'reupload', group: 'Job seeker: /verification', label: 'Re-upload needed', kind: 'seeker', note: 'The reviewer asked for the police record again. Free for the job seeker.', data: () => seeker({ open: inProgress({ status: 'reupload_needed', rtw_group_claimed: 'citizen', has_rtw_file: true, reupload_documents: ['police_record'], decision_reason: 'photo_unreadable', submitted_at: ago(2) }) }) },
  { key: 'verified', group: 'Job seeker: /verification', label: 'Verified', kind: 'seeker', note: 'Badge, previews of the stamped copies, who has the documents and who opened them. Try Stop sharing and Delete my documents.', data: () => seeker({ badge: check(), shares: shares() }) },
  { key: 'verified-notice', group: 'Job seeker: /verification', label: 'Verified, with notice', kind: 'seeker', note: 'Shown when the reviewer set "Show the job seeker a notice before sharing".', data: () => seeker({ badge: check({ sharing_notice: true }) }) },
  { key: 'permit', group: 'Job seeker: /verification', label: 'Verified, permit holder', kind: 'seeker', note: 'The badge never suggests a permit holder can start with a new employer straight away.', data: () => seeker({ badge: check({ rtw_group: 'work_permit', rtw_document_type: 'work_permit', verified_until: addMonths(today, 3) }) }) },
  { key: 'expiring', group: 'Job seeker: /verification', label: 'Expiring', kind: 'seeker', note: 'From 30 days before the end date.', data: () => seeker({ badge: check({ verified_until: inDays(11) }), shares: shares().slice(0, 1) }) },
  { key: 'not-approved', group: 'Job seeker: /verification', label: 'Not approved', kind: 'seeker', note: 'Reason and refund, then the offer again.', data: () => seeker({ last: inProgress({ status: 'not_approved', decision_reason: 'name_mismatch', refunded_at: ago(1), reviewed_at: ago(1) }) }) },
  { key: 'expired', group: 'Job seeker: /verification', label: 'Expired', kind: 'seeker', note: '', data: () => seeker({ last: check({ status: 'expired', verified_until: inDays(-3), valid: false, has_police_record_file: false }) }) },
  { key: 'admin-locked', group: 'Admin: /admin/verifications', label: 'Upload switch', kind: 'admin', note: 'What you see after the first payments, before uploads are open.', data: () => queue(false) },
  { key: 'admin-queue', group: 'Admin: /admin/verifications', label: 'Queue and review', kind: 'admin', note: 'Press Review to open the review screen with sample documents. Decisions here change only this preview.', data: () => queue(true) },
  { key: 'apply-required', group: 'Apply form', label: 'Verified, police record required', kind: 'apply', note: 'Both ticks start on because the employer ticked "Police record required".', data: () => ({ verified: true, notice: false, holdsWorkPermit: false, policeRecordRequired: true, priorApplications: 4, canBuy: true }) },
  { key: 'apply-optional', group: 'Apply form', label: 'Verified, not required', kind: 'apply', note: 'Ticks start off on other jobs.', data: () => ({ verified: true, notice: false, holdsWorkPermit: false, policeRecordRequired: false, priorApplications: 4, canBuy: true }) },
  { key: 'apply-notice', group: 'Apply form', label: 'Verified, with notice', kind: 'apply', note: 'The notice shows first and the ticks start off, even on a job that requires a police record.', data: () => ({ verified: true, notice: true, holdsWorkPermit: false, policeRecordRequired: true, priorApplications: 4, canBuy: true }) },
  { key: 'apply-unverified', group: 'Apply form', label: 'Not verified', kind: 'apply', note: 'One line, and only on jobs marked "Police record required". Other jobs show nothing.', data: () => ({ verified: false, notice: false, holdsWorkPermit: false, policeRecordRequired: true, priorApplications: 2, canBuy: true }) },
  { key: 'billing-free', group: 'Employer pricing', label: 'Billing: free employer', kind: 'billing', note: 'What a free employer sees on /billing. Buying opens the Stripe Payment Link; here it does nothing.', data: () => billing({}) },
  { key: 'billing-credit', group: 'Employer pricing', label: 'Billing: Spotlight to use', kind: 'billing', note: 'After buying a Spotlight (or with a Pro month credit): pick a vacancy and a preferred start date.', data: () => billing({ credits: [{ id: 'c1', source: 'purchase', expires_at: null, created_at: ago(0) }], campaigns: [campaignRow('requested')] }) },
  { key: 'billing-pro', group: 'Employer pricing', label: 'Billing: Employer Pro', kind: 'billing', note: 'Pro with its monthly Spotlight, which expires with the paid month.', data: () => billing({ pro: { active: true, source: 'paid', paidThrough: inDays(19), status: 'active', cancelAtPeriodEnd: false, manageable: true }, credits: [{ id: 'c2', source: 'pro_period', expires_at: inDays(19), created_at: ago(11) }], campaigns: [campaignRow('live'), campaignRow('ended')] }) },
  { key: 'billing-cancelled', group: 'Employer pricing', label: 'Billing: Pro cancelled', kind: 'billing', note: 'Cancelled at period end: access continues until the paid-through date.', data: () => billing({ pro: { active: true, source: 'paid', paidThrough: inDays(6), status: 'active', cancelAtPeriodEnd: true, manageable: true } }) },
  { key: 'billing-claim', group: 'Employer pricing', label: 'Billing: claim a payment', kind: 'billing', note: 'A Spotlight paid through a shared link with this employer\'s email address.', data: () => billing({ claimable: [{ id: 'o1', offer: 'spotlight', amount: 12500, paid_at: ago(1) }] }) },
  { key: 'upgrade', group: 'Employer pricing', label: 'Directory: free employer', kind: 'upgrade', note: 'Browse Candidates once the directory is restricted to Pro.', data: () => ({}) },
  { key: 'billing-admin', group: 'Employer pricing', label: 'Admin: billing queue', kind: 'billing-admin', note: 'Campaigns to schedule and run, payments to match, and the directory switch. Actions here change only this preview.', data: () => billingQueue() },
  { key: 'pieces', group: 'Everywhere else', label: 'Badges, cards, emails', kind: 'pieces', note: 'The smaller pieces that appear on existing pages, plus every email.', data: () => ({}) },
]

const sample = (document: string, extra = '') => `/api/preview/verified-sample?document=${document}${extra}`
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Answers the components' API calls from the scene's made-up data. */
function mockApi(scene: Scene, data: Json, goTo: (key: string) => void) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin)
    const method = (init?.method || 'GET').toUpperCase()
    const path = url.pathname
    if (path === '/api/admin/employer-billing') {
      await new Promise((resolve) => setTimeout(resolve, 250))
      if (method === 'GET') return reply(url.searchParams.has('company_q') ? { companies: [{ id: 'co1', company_name: 'Treehouse Beach Club', contact_email: 'manager@example.com' }] } : data)
      const body = init?.body instanceof FormData ? {} : JSON.parse(String(init?.body || '{}'))
      const campaigns = data.campaigns as Json[]
      const target = campaigns.find((item) => item.id === body.campaign_id)
      if (body.action === 'assign_order') data.orders = []
      if (body.action === 'set_directory_gate') { data.directoryGated = body.gated; data.gatedAt = new Date().toISOString() }
      if (target && body.action === 'schedule') target.status = 'scheduled'
      if (target && body.action === 'go_live') Object.assign(target, { status: 'live', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 168 * 3_600_000).toISOString(), stats: { views: 0, applications: 0 } })
      if (target && body.action === 'save_proof') Object.assign(target, Object.fromEntries(Object.entries(body).filter(([key]) => key.endsWith('_url'))))
      if (target && body.action === 'send_proof') Object.assign(target, { proof_sent_at: new Date().toISOString(), proof_overdue: false })
      if (target && body.action === 'mark_day3') Object.assign(target, { day3_checked_at: new Date().toISOString(), day3_due: false })
      if (target && body.action === 'mark_edit') target.edit_used_at = new Date().toISOString()
      if (target && body.action === 'end') Object.assign(target, { status: 'ended', ended_reason: 'manual' })
      if (target && body.action === 'cancel') data.campaigns = campaigns.filter((item) => item !== target)
      return reply({ success: true })
    }
    if (path.startsWith('/api/employer/billing/')) return reply({ error: 'Payments are not taken in the preview.' }, 400)
    if (!path.startsWith('/api/verification') && !path.startsWith('/api/admin/verifications')) return null
    await new Promise((resolve) => setTimeout(resolve, 350))

    if (path === '/api/verification/apply-context') return reply(data)
    if (path === '/api/verification' && method === 'GET') return reply(data)
    if (path === '/api/verification' && method === 'DELETE') {
      data.last = { ...(data.badge as Json), status: 'withdrawn', valid: false }
      data.badge = null
      data.shares = []
      return reply({ success: true })
    }
    if (path === '/api/verification/checkout') { goTo('paid-open'); return reply({ url: '/preview/verified?scene=paid-open' }) }
    if (path.startsWith('/api/verification/shares/')) {
      const share = (data.shares as Json[]).find((item) => path.endsWith(`/${item.id}`))
      if (share) share.revoked_at = new Date().toISOString()
      return reply({ success: true })
    }
    if (path.endsWith('/upload')) {
      const form = init?.body as FormData
      const open = data.open as Json
      if (form.get('action') === 'document') {
        open[form.get('document') === 'rtw' ? 'has_rtw_file' : 'has_police_record_file'] = true
      } else {
        Object.assign(open, { status: 'submitted', submitted_at: new Date().toISOString(), reupload_documents: [], rtw_group_claimed: form.get('group') || open.rtw_group_claimed })
      }
      data.open = { ...open }
      return reply({ verification: data.open })
    }
    if (path === '/api/admin/verifications') return reply(data)
    if (path === '/api/admin/verifications/settings') {
      const waiting = data.paidWaiting
      Object.assign(data, queue(true))
      return reply({ success: true, emailed: waiting })
    }
    if (path.startsWith('/api/admin/verifications/') && method === 'POST') {
      const id = path.split('/').pop()
      const body = JSON.parse(String(init?.body || '{}'))
      const item = (data.waiting as Json[]).find((entry) => entry.id === id)
      if (item) {
        data.waiting = (data.waiting as Json[]).filter((entry) => entry.id !== id)
        if (body.decision === 'reupload') (data.reupload as Json[]).unshift({ ...item, status: 'reupload_needed', decision_reason: body.reason, reupload_documents: body.documents })
        else (data.decided as Json[]).unshift({ ...item, reviewed_at: new Date().toISOString(), ...(body.decision === 'approve'
          ? { status: 'approved', verified_until: addMonths(body.police_record_issued_on, 6) }
          : { status: 'not_approved', decision_reason: body.reason, refunded: true }) })
      }
      return reply({ success: true, filesRemoved: true })
    }
    return reply({ error: 'Not part of the preview.' }, 404)
  }
}

function Frame({ label, children, narrow = false }: { label: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-white">
      <p className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <div className={`p-4 ${narrow ? 'max-w-xl' : ''}`}>{children}</div>
    </section>
  )
}

const EMAILS: [string, string][] = [
  ['verification_upload_ready', 'Paid, uploads open'], ['verification_paid_waiting', 'Paid, uploads locked'],
  ['verification_approved', 'Approved'], ['verification_reupload', 'Re-upload needed'], ['verification_not_approved', 'Not approved, refunded'],
  ['verification_expiring', '14 days before expiry'], ['verification_expired', 'Expired'], ['verification_upload_reminder', 'Upload reminder'],
  ['new_applicant', 'Employer: new applicant with documents'],
]

function Pieces() {
  const badge = { holdsWorkPermit: false, checkedOn: today }
  const row = (name: string, initials: string, verified: boolean, shared: boolean) => (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{initials}</div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text">{name}</h3>
            <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Applied</span>
            {verified && <VerifiedBadge badge={badge} compact />}
          </div>
          <p className="mt-0.5 text-xs text-text-light">St John&apos;s · 3 yrs experience · Applied today</p>
          {shared && (
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={sample('police_record')} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">View police record</a>
              <a href={sample('rtw')} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">View right to work</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
  return (
    <div className="space-y-5">
      <Frame label="Badge wording (profile, candidate profile)">
        <div className="flex flex-col items-start gap-3">
          <VerifiedBadge badge={badge} />
          <VerifiedBadge badge={{ holdsWorkPermit: true, checkedOn: today }} />
          <div className="flex items-center gap-2 text-sm text-text-light">Compact, on lists: <VerifiedBadge badge={badge} compact /></div>
        </div>
      </Frame>
      <Frame label="Job seeker dashboard card (one line, by status)">
        <VerifiedDashboardCard line="Police record and right to work, sorted before you apply. EC$40 for 6 months." cta="Get verified" dismissible={false} />
        <VerifiedDashboardCard line="Payment received. Upload your documents to get verified." cta="Upload" dismissible={false} />
        <VerifiedDashboardCard line="Your documents are under review. Usually within 48 hours." cta="View" dismissible={false} />
        <VerifiedDashboardCard line={`Your verified badge ends on ${inDays(11)}. Renew to keep it.`} cta="Renew" dismissible={false} />
      </Frame>
      <Frame label="Employer: applicant list (badge, document buttons, same order as today)">
        <div className="mb-3 flex items-center justify-end gap-2 text-xs"><span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">Verified only</span><span className="text-text-muted">Sort:</span><span className="rounded-lg bg-primary/10 px-2.5 py-1 font-medium text-primary">Newest</span></div>
        <div className="space-y-3">
          {row('Sam Seeker', 'SS', true, true)}
          {row('Dana Daniel', 'DD', false, false)}
          {row('Gina George', 'GG', true, false)}
        </div>
        <p className="mt-3 text-xs text-text-muted">Gina is verified but chose not to send documents with this application, so there are no buttons.</p>
      </Frame>
      <Frame label="Job listing label and post-a-job tickbox">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">Full-time</span>
          <PoliceRecordRequiredLabel />
        </div>
        <div className="mt-4 rounded-xl border border-border p-5">
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" defaultChecked /><span className="font-medium text-text">Police record required</span></label>
          <p className="mt-2 text-sm leading-relaxed text-text-light">Shows a &ldquo;Police record required&rdquo; label on your listing. Applicants who are JobLink Verified can send you a police record that JobLink has checked, together with their application. Anyone can still apply.</p>
        </div>
      </Frame>
      <Frame label="Application sent screen (unverified, from their 2nd application)">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4">
          <p className="flex-1 text-sm text-text">Next time, send your police record in one click.</p>
          <span className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white">See how</span>
        </div>
      </Frame>
      <Frame label="What an employer opens (made with the real stamping code)">
        <div className="flex flex-wrap gap-2 text-sm">
          <a className="rounded-lg border border-border px-3 py-2 font-semibold text-primary" href={sample('police_record')} target="_blank" rel="noopener noreferrer">Stamped police record</a>
          <a className="rounded-lg border border-border px-3 py-2 font-semibold text-primary" href={sample('rtw')} target="_blank" rel="noopener noreferrer">Right-to-work confirmation</a>
          <a className="rounded-lg border border-border px-3 py-2 font-semibold text-primary" href={sample('rtw', '&permit=1')} target="_blank" rel="noopener noreferrer">Confirmation, permit holder</a>
        </div>
      </Frame>
      <Frame label="Emails (each opens in a new tab)">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {EMAILS.map(([type, label]) => <li key={type}><a className="font-semibold text-primary underline" href={`/preview/verified/email/${type}`} target="_blank" rel="noopener noreferrer">{label}</a></li>)}
        </ul>
      </Frame>
      <Frame label="Public pages (these are the real pages)">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {[['/verified', 'Verified explainer'], ['/verified/check', 'Check a code'], ['/guides/police-record', 'Police record guide'], ['/two-step', 'Two-step login (needs sign-in)']].map(([href, label]) => (
            <li key={href}><a className="font-semibold text-primary underline" href={href} target="_blank" rel="noopener noreferrer">{label}</a></li>
          ))}
        </ul>
      </Frame>
    </div>
  )
}

export default function VerifiedPreviewGallery({ initialScene }: { initialScene?: string }) {
  const [key, setKey] = useState(SCENES.some((scene) => scene.key === initialScene) ? initialScene! : 'offer')
  const [run, setRun] = useState(0)
  const [ready, setReady] = useState('')
  const [phone, setPhone] = useState(false)
  const scene = SCENES.find((item) => item.key === key)!
  const groups = useMemo(() => [...new Set(SCENES.map((item) => item.group))], [])
  const instance = `${key}:${run}`

  // Swap in the made-up API for this scene, and send document links to samples.
  useEffect(() => {
    const real = window.fetch
    const answer = mockApi(scene, scene.data(), (next) => setKey(next))
    window.fetch = async (input, init) => (await answer(input, init)) ?? real(input, init)
    const redirect = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a')
      const href = link?.getAttribute('href') || ''
      const to = href.startsWith('/api/verification/preview') ? sample(new URL(href, location.origin).searchParams.get('document') || 'police_record', '&for=owner')
        : href.startsWith('/api/verification/documents/') ? sample(new URL(href, location.origin).searchParams.get('document') || 'police_record') : ''
      if (to) { event.preventDefault(); window.open(to, '_blank', 'noopener') }
    }
    document.addEventListener('click', redirect, true)
    const timer = setTimeout(() => setReady(instance), 0)
    return () => { window.fetch = real; document.removeEventListener('click', redirect, true); clearTimeout(timer) }
  }, [scene, instance])

  return (
    <div className="min-h-screen bg-bg-alt">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
        <strong>Preview.</strong> Made-up people and data. Nothing here is saved, charged or emailed.
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Screens" className="lg:sticky lg:top-4 lg:self-start">
          <h1 className="font-display text-lg font-bold text-text">JobLink preview</h1>
          {/* On a phone, one dropdown instead of the full list. */}
          <label className="mt-3 block lg:hidden">
            <span className="sr-only">Screen</span>
            <select value={key} onChange={(event) => { setKey(event.target.value); setRun(run + 1) }}
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-medium text-text">
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {SCENES.filter((item) => item.group === group).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {groups.map((group) => (
            <div key={group} className="mt-4 hidden lg:block">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{group}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
                {SCENES.filter((item) => item.group === group).map((item) => (
                  <button key={item.key} onClick={() => { setKey(item.key); setRun(run + 1) }} aria-current={item.key === key}
                    className={`rounded-lg px-2.5 py-1.5 text-left text-sm ${item.key === key ? 'bg-primary font-semibold text-white' : 'border border-border bg-white text-text lg:border-0 lg:bg-transparent lg:hover:bg-white'}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <main className="min-w-0">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold text-text">{scene.label}</h2>
              {scene.note && <p className="mt-1 max-w-2xl text-sm text-text-light">{scene.note}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {scene.kind !== 'pieces' && <button className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-text" onClick={() => setPhone(!phone)}>{phone ? 'Full width' : 'Phone width'}</button>}
              <button className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-text" onClick={() => setRun(run + 1)}>Reset</button>
            </div>
          </div>

          <div data-preview-screen className={`rounded-2xl border border-border bg-bg ${phone && scene.kind !== 'pieces' ? 'mx-auto max-w-[390px]' : ''}`}>
            {/* Mounted only once this scene's made-up API is in place. */}
            {ready === instance && (
              <VerifiedFlagProvider enabled>
                {scene.kind === 'seeker' && <VerificationPanel key={instance} justPaid={false} cancelled={false} />}
                {scene.kind === 'admin' && <VerificationReview key={instance} documentUrl={(_id, kind) => sample(`raw_${kind}`)} />}
                {scene.kind === 'apply' && (
                  <div className="mx-auto max-w-2xl space-y-5 p-5" key={instance}>
                    <textarea rows={4} readOnly className="w-full rounded-xl border border-border/60 bg-white px-4 py-3.5 text-sm text-text-muted" value="Tell the employer why you're a great fit for this role..." />
                    <ApplyVerifiedDocuments jobId={ID} onChoice={() => {}} />
                    <div className="rounded-xl bg-primary px-6 py-3.5 text-center text-base font-semibold text-white">Submit Application</div>
                    <p className="text-center text-xs text-text-muted">The rest of the apply form is unchanged.</p>
                  </div>
                )}
                {scene.kind === 'pieces' && <div className="p-4"><Pieces /></div>}
                {scene.kind === 'billing' && <EmployerBillingPanel key={instance} summary={scene.data() as unknown as EmployerBillingSummary} focusJobId={null} justPaid={false} />}
                {scene.kind === 'billing-admin' && <EmployerBillingAdmin key={instance} />}
                {scene.kind === 'upgrade' && <div className="p-4"><ProUpgradePrompt /></div>}
              </VerifiedFlagProvider>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
