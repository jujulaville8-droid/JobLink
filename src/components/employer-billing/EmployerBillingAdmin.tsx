'use client'

import { useCallback, useEffect, useState } from 'react'

interface Order { id: string; offer: string; status: string; amount: number | null; customer_email: string | null; paid_at: string | null; review_reason: string | null; company_id: string | null; company_name: string | null }
interface Campaign {
  id: string; status: string; company: string; job_title: string; job_id: string; job_status: string | null
  requested_start: string; starts_at: string | null; ends_at: string | null; ended_reason: string | null
  website_url: string | null; facebook_url: string | null; instagram_url: string | null; evidence_count: number
  proof_sent_at: string | null; edit_used_at: string | null; day3_checked_at: string | null; report_sent_at: string | null
  needs_review: boolean; proof_overdue: boolean; day3_due: boolean; stats: { views: number | null; applications: number } | null
}
interface Queue { directoryGated: boolean; gatedAt: string | null; orders: Order[]; campaigns: Campaign[] }

const card = 'rounded-2xl border border-border bg-white p-5'
const primary = 'inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50'
const quiet = 'inline-flex items-center justify-center rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold text-text disabled:opacity-50'
const input = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text'
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Antigua' }).format(new Date(iso)) : '')
const REASONS: Record<string, string> = {
  unassigned: 'Paid without a JobLink reference: match it to a company', duplicate_subscription: 'A second Pro subscription for a company that already has one',
  refunded: 'Refunded in Stripe', partial_refund: 'Partly refunded in Stripe', disputed: 'Disputed with the card issuer', reference_mismatch: 'Reference did not match', company_has_pro: 'Company already has Pro',
}

async function call(body: unknown) {
  const response = await fetch('/api/admin/employer-billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'That change could not be saved.')
  return data
}

const TABS = [['requested', 'To schedule'], ['live', 'Live'], ['ended', 'Ended'], ['payments', 'Payments to review'], ['settings', 'Directory and credits']] as const
type Tab = typeof TABS[number][0]

export default function EmployerBillingAdmin() {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [tab, setTab] = useState<Tab>('requested')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/employer-billing', { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Could not load the billing queue.')
    setQueue(data)
  }, [])
  useEffect(() => {
    let live = true
    fetch('/api/admin/employer-billing', { cache: 'no-store' }).then(async (response) => {
      const data = await response.json().catch(() => ({}))
      if (!live) return
      if (response.ok) setQueue(data); else setError(data.error || 'Could not load the billing queue.')
    }).catch(() => { if (live) setError('Could not load the billing queue.') })
    return () => { live = false }
  }, [])

  async function act(name: string, body: unknown, done?: string) {
    setBusy(name); setError(''); setMessage('')
    try { await call(body); if (done) setMessage(done); await load() } catch (problem) { setError(problem instanceof Error ? problem.message : 'Failed.') }
    setBusy('')
  }

  if (!queue) return <div className="mx-auto max-w-5xl px-4 py-6">{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <p role="status" className="text-sm text-text-light">Loading…</p>}</div>
  const by = (statuses: string[]) => queue.campaigns.filter((c) => statuses.includes(c.status))
  const counts: Record<Tab, number> = { requested: by(['requested', 'scheduled']).length, live: by(['live']).length, ended: by(['ended']).length, payments: queue.orders.length, settings: 0 }
  const attention = queue.campaigns.filter((c) => c.proof_overdue || c.day3_due || c.needs_review).length + queue.orders.length

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-text">Employer billing</h1>
        <p className="mt-1 text-sm text-text-light">Spotlights to run, payments to match, and the candidate directory switch. {attention > 0 && <strong className="text-amber-800">{attention} need attention.</strong>}</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      <div role="tablist" aria-label="Billing queue" className="flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === key ? 'bg-primary text-white' : 'border border-border bg-white text-text'}`}>
            {label}{key !== 'settings' ? ` (${counts[key]})` : ''}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-3">
        {tab === 'requested' && (by(['requested', 'scheduled']).length === 0 ? <Empty /> : by(['requested', 'scheduled']).map((c) => (
          <section key={c.id} className={card}>
            <CampaignHead campaign={c} />
            <p className="mt-2 text-sm text-text-light">Preferred start {c.requested_start}. Before go-live: confirm the vacancy is open, agree role, artwork, pay and shift details with the employer, and prepare the Facebook and Instagram posts.</p>
            <ProofForm campaign={c} busy={busy} onSave={(urls) => act(`proof-${c.id}`, { action: 'save_proof', campaign_id: c.id, ...urls }, 'Links saved.')} />
            <div className="mt-3 flex flex-wrap gap-2">
              {c.status === 'requested' && <button className={quiet} disabled={!!busy} onClick={() => act(`sched-${c.id}`, { action: 'schedule', campaign_id: c.id }, 'Marked as scheduled.')}>Employer approved: scheduled</button>}
              <button className={primary} disabled={!!busy || c.job_status !== 'active'} onClick={() => confirm(`Put "${c.job_title}" live now? The seven days start immediately.`) && act(`live-${c.id}`, { action: 'go_live', campaign_id: c.id }, 'Live. Featured for 168 hours.')}>Go live now</button>
              <button className={quiet} disabled={!!busy} onClick={() => confirm('Cancel this Spotlight? The employer keeps the credit.') && act(`cancel-${c.id}`, { action: 'cancel', campaign_id: c.id }, 'Cancelled; the credit is available again.')}>Cancel, return credit</button>
            </div>
            {c.job_status !== 'active' && <p className="mt-2 text-sm text-red-700">The vacancy is no longer live. Agree another role or a refund with the employer.</p>}
          </section>
        )))}

        {tab === 'live' && (by(['live']).length === 0 ? <Empty /> : by(['live']).map((c) => (
          <section key={c.id} className={card}>
            <CampaignHead campaign={c} />
            <p className="mt-1 text-sm text-text-light">Live {when(c.starts_at)} until {when(c.ends_at)} · {c.stats ? `${c.stats.applications} applications${c.stats.views !== null ? `, ${c.stats.views} views` : ''} so far` : ''}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {c.proof_overdue && <Flag>Proof overdue: send links and screenshots</Flag>}
              {c.day3_due && <Flag>Day-three check due</Flag>}
              {c.needs_review && <Flag>Payment reversed: review</Flag>}
              {c.proof_sent_at && <Ok>Proof sent {when(c.proof_sent_at)}</Ok>}
              {c.edit_used_at && <Ok>Edit used</Ok>}
            </div>
            <ProofForm campaign={c} busy={busy} onSave={(urls) => act(`proof-${c.id}`, { action: 'save_proof', campaign_id: c.id, ...urls }, 'Links saved.')} />
            <Evidence campaign={c} onUploaded={load} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={primary} disabled={!!busy || !c.website_url || !c.facebook_url || !c.instagram_url} onClick={() => act(`send-${c.id}`, { action: 'send_proof', campaign_id: c.id }, 'Proof emailed to the employer.')}>Email proof to employer</button>
              {!c.day3_checked_at && <button className={quiet} disabled={!!busy} onClick={() => act(`d3-${c.id}`, { action: 'mark_day3', campaign_id: c.id }, 'Day-three check recorded.')}>Day-three check done</button>}
              {!c.edit_used_at && <button className={quiet} disabled={!!busy} onClick={() => act(`edit-${c.id}`, { action: 'mark_edit', campaign_id: c.id }, 'Edit recorded. Re-share the updated post.')}>Record the approved edit</button>}
              {c.needs_review && <button className={quiet} disabled={!!busy} onClick={() => act(`rev-${c.id}`, { action: 'resolve_review', campaign_id: c.id })}>Mark reviewed</button>}
              <button className={quiet} disabled={!!busy} onClick={() => confirm('End this Spotlight now?') && act(`end-${c.id}`, { action: 'end', campaign_id: c.id }, 'Ended.')}>End early</button>
            </div>
          </section>
        )))}

        {tab === 'ended' && (by(['ended']).length === 0 ? <Empty /> : by(['ended']).map((c) => (
          <section key={c.id} className={card}>
            <CampaignHead campaign={c} />
            <p className="mt-1 text-sm text-text-light">
              {c.ended_reason === 'job_closed' ? 'Ended when the vacancy closed' : c.ended_reason === 'manual' ? 'Ended by JobLink' : 'Completed 168 hours'} · {when(c.starts_at)} to {when(c.ends_at)}
              {c.stats ? ` · ${c.stats.applications} applications${c.stats.views !== null ? `, ${c.stats.views} views` : ''}` : ''}
            </p>
            <p className="mt-1 text-xs text-text-muted">{c.report_sent_at ? `Results emailed ${when(c.report_sent_at)}` : 'Results email pending'}{c.proof_sent_at ? '' : ' · Proof was never sent'}</p>
            {c.needs_review && <button className={`${quiet} mt-2`} disabled={!!busy} onClick={() => act(`rev-${c.id}`, { action: 'resolve_review', campaign_id: c.id })}>Payment reversed: mark reviewed</button>}
          </section>
        )))}

        {tab === 'payments' && (queue.orders.length === 0 ? <Empty /> : queue.orders.map((order) => (
          <section key={order.id} className={card}>
            <p className="font-semibold text-text">{order.offer === 'pro' ? 'Employer Pro' : 'Job Spotlight'} · {order.amount ? `EC$${order.amount / 100}` : ''} · {order.status}</p>
            <p className="mt-1 text-sm text-text-light">{REASONS[order.review_reason ?? ''] ?? order.review_reason}{order.paid_at ? ` · paid ${when(order.paid_at)}` : ''}</p>
            <p className="mt-1 text-sm text-text-light">Receipt email: {order.customer_email ?? 'none'}{order.company_name ? ` · company: ${order.company_name}` : ''}</p>
            {order.company_id
              ? <button className={`${quiet} mt-3`} disabled={!!busy} onClick={() => act(`res-${order.id}`, { action: 'resolve_review', order_id: order.id }, 'Marked as reviewed.')}>Mark reviewed</button>
              : <AssignCompany busy={busy} onAssign={(companyId, name) => confirm(`Assign this payment to ${name}? Only do this once you have confirmed with them.`) && act(`assign-${order.id}`, { action: 'assign_order', order_id: order.id, company_id: companyId }, `Assigned to ${name}.`)} />}
          </section>
        )))}

        {tab === 'settings' && (
          <>
            <section className={card}>
              <h2 className="font-display text-lg font-semibold text-text">Candidate directory</h2>
              <p className="mt-1 text-sm text-text-light">{queue.directoryGated ? `Pro only since ${when(queue.gatedAt)}. Free employers see an Employer Pro prompt; their own applicants stay visible.` : 'Open to every employer, as today.'}</p>
              {queue.directoryGated
                ? <button className={`${quiet} mt-3`} disabled={!!busy} onClick={() => confirm('Open the directory to every employer again?') && act('gate', { action: 'set_directory_gate', gated: false }, 'The directory is open to every employer.')}>Open to every employer</button>
                : <button className={`${primary} mt-3`} disabled={!!busy} onClick={() => {
                    const typed = prompt('Existing employers must be told before browsing becomes Pro only. Type NOTICE SENT to confirm.')
                    if (typed === 'NOTICE SENT') void act('gate', { action: 'set_directory_gate', gated: true, confirm: 'NOTICE SENT' }, 'The directory is now Pro only.')
                  }}>Restrict to Employer Pro</button>}
            </section>
            <section className={card}>
              <h2 className="font-display text-lg font-semibold text-text">Give a company a Spotlight</h2>
              <p className="mt-1 text-sm text-text-light">For a replacement after a missed placement, or a complimentary or manual Pro arrangement. It does not expire.</p>
              <AssignCompany busy={busy} label="Give a Spotlight" onAssign={(companyId, name) => confirm(`Give ${name} one Spotlight?`) && act(`grant-${companyId}`, { action: 'grant_credit', company_id: companyId }, `${name} has a Spotlight to use.`)} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function Empty() { return <p className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-text-muted">Nothing here.</p> }
function Flag({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">{children}</span> }
function Ok({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">{children}</span> }

function CampaignHead({ campaign }: { campaign: Campaign }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="font-semibold text-text">{campaign.job_title} <span className="font-normal text-text-light">· {campaign.company}</span></p>
      <a className="text-xs font-semibold text-primary underline" href={`/jobs/${campaign.job_id}`} target="_blank" rel="noopener noreferrer">Open listing</a>
    </div>
  )
}

function ProofForm({ campaign, busy, onSave }: { campaign: Campaign; busy: string; onSave: (urls: Record<string, string | null>) => void }) {
  const [urls, setUrls] = useState({ website_url: campaign.website_url ?? '', facebook_url: campaign.facebook_url ?? '', instagram_url: campaign.instagram_url ?? '' })
  const fields: [keyof typeof urls, string][] = [['website_url', 'JobLink listing link'], ['facebook_url', 'Facebook post link'], ['instagram_url', 'Instagram post link']]
  if (campaign.status === 'requested') return null
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {fields.map(([key, label]) => (
        <label key={key} className="text-xs font-medium text-text">{label}
          <input className={`${input} mt-1`} type="url" placeholder="https://" value={urls[key]} onChange={(event) => setUrls({ ...urls, [key]: event.target.value })} />
        </label>
      ))}
      <div className="sm:col-span-3"><button className={quiet} disabled={!!busy} onClick={() => onSave(Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, v.trim() || null])))}>Save links</button></div>
    </div>
  )
}

function Evidence({ campaign, onUploaded }: { campaign: Campaign; onUploaded: () => Promise<void> }) {
  const [state, setState] = useState('')
  return (
    <div className="mt-3 text-sm">
      <p className="text-text-light">{campaign.evidence_count} screenshot{campaign.evidence_count === 1 ? '' : 's'} stored (one for each placement).</p>
      {campaign.evidence_count < 6 && (
        <label className="mt-1 inline-flex cursor-pointer text-sm font-semibold text-primary underline">
          {state || 'Add screenshot'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setState('Uploading…')
            const form = new FormData()
            form.set('campaign_id', campaign.id)
            form.set('file', file)
            const response = await fetch('/api/admin/employer-billing', { method: 'POST', body: form })
            const data = await response.json().catch(() => ({}))
            setState(response.ok ? '' : data.error || 'Upload failed')
            event.target.value = ''
            if (response.ok) await onUploaded()
          }} />
        </label>
      )}
    </div>
  )
}

function AssignCompany({ busy, onAssign, label = 'Assign' }: { busy: string; onAssign: (companyId: string, name: string) => void; label?: string }) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<{ id: string; company_name: string; contact_email: string | null }[]>([])
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input className={input} placeholder="Search company name" value={term} onChange={(event) => setTerm(event.target.value)} />
        <button className={quiet} disabled={term.trim().length < 2} onClick={async () => {
          const response = await fetch(`/api/admin/employer-billing?company_q=${encodeURIComponent(term)}`, { cache: 'no-store' })
          setResults((await response.json().catch(() => ({ companies: [] }))).companies ?? [])
        }}>Search</button>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {results.map((company) => (
            <li key={company.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>{company.company_name}{company.contact_email ? <span className="text-text-muted"> · {company.contact_email}</span> : null}</span>
              <button className={quiet} disabled={!!busy} onClick={() => onAssign(company.id, company.company_name)}>{label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
