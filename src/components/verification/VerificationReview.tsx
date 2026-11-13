'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  NOT_APPROVED_REASONS, REUPLOAD_REASONS, REVIEW_CHECKLIST, RTW_DOCUMENT_TYPES, RTW_GROUPS, RTW_GROUP_KEYS,
  antiguaToday, decisionReasonText, longDate, verifiedUntil, type RtwDocumentType, type RtwGroup, type VerificationDocument,
} from '@/lib/verification/shared'

interface Item {
  id: string
  status: string
  name: string
  rtw_group_claimed: RtwGroup | null
  rtw_group: RtwGroup | null
  verified_until: string | null
  submitted_at: string | null
  reviewed_at: string | null
  decision_reason: string | null
  reupload_documents: VerificationDocument[]
  refunded: boolean
  has_rtw_file: boolean
  has_police_record_file: boolean
}
interface Queue {
  uploadsOpen: boolean
  fileKeyReady: boolean
  paidWaiting: number
  waiting: Item[]
  reupload: Item[]
  decided: Item[]
}

const card = 'rounded-2xl border border-border bg-surface p-5'
const input = 'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text'
const primaryButton = 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'
const quietButton = 'inline-flex items-center justify-center rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-text disabled:opacity-50'

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: 'no-store' })
  const body = await response.json().catch(() => ({}))
  if (response.status === 403 && body.code === 'MFA_REQUIRED') { window.location.href = '/two-step?next=/admin/verifications'; throw new Error('Two-step login needed.') }
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Try again.')
  return body
}
const post = (path: string, body: unknown) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const hoursSince = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 3_600_000) : 0)

const TABS = [['waiting', 'Waiting for review'], ['reupload', 'Re-upload requested'], ['decided', 'Recently decided']] as const
type Tab = typeof TABS[number][0]

export default function VerificationReview() {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('waiting')
  const [selected, setSelected] = useState<Item | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try { setQueue(await api('/api/admin/verifications')); setError('') }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not load the queue.') }
  }, [])
  useEffect(() => {
    let live = true
    api('/api/admin/verifications')
      .then((data) => { if (live) setQueue(data) })
      .catch((problem) => { if (live) setError(problem instanceof Error ? problem.message : 'Could not load the queue.') })
    return () => { live = false }
  }, [])

  if (selected) {
    return <ReviewScreen item={selected} onBack={() => setSelected(null)} onDone={async (text) => { setSelected(null); setMessage(text); await load() }} />
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-text">Verifications</h1>
        <p className="mt-1 text-sm text-text-light">Check that documents are genuine, recent and belong to the person. What a police record says never decides the outcome.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</p>}
      {!queue && !error && <p className="text-sm text-text-light" role="status">Loading…</p>}

      {queue && !queue.uploadsOpen && <UploadSwitch queue={queue} onOpened={async (text) => { setMessage(text); await load() }} />}

      {queue && (
        <section className={card}>
          <div role="tablist" aria-label="Review queue" className="flex flex-wrap gap-2">
            {TABS.map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === key ? 'bg-primary text-white' : 'border border-border bg-white text-text'}`}>
                {label} ({queue[key].length})
              </button>
            ))}
          </div>
          <div role="tabpanel" className="mt-4">
            {queue[tab].length === 0 ? <p className="py-6 text-center text-sm text-text-muted">Nothing here.</p> : (
              <ul className="divide-y divide-border">
                {queue[tab].map((item) => {
                  const hours = hoursSince(item.submitted_at)
                  const late = tab === 'waiting' && hours >= 48
                  return (
                    <li key={item.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${late ? '-mx-2 rounded-lg bg-amber-50 px-2' : ''}`}>
                      <div className="min-w-0">
                        <p className="font-medium text-text">{item.name}</p>
                        <p className="text-sm text-text-light">
                          {item.rtw_group_claimed ? RTW_GROUPS[item.rtw_group_claimed].label : 'No group chosen'}
                          {item.submitted_at ? ` · submitted ${longDate(item.submitted_at)}` : ''}
                        </p>
                        {tab === 'waiting' && <p className={`text-xs ${late ? 'font-semibold text-amber-900' : 'text-text-muted'}`}>Waiting {hours} hour{hours === 1 ? '' : 's'}{late ? ' · over 48 hours' : ''}</p>}
                        {tab === 'reupload' && <p className="text-xs text-text-muted">{decisionReasonText(item.decision_reason)}</p>}
                        {tab === 'decided' && <p className="text-xs text-text-muted">{item.status === 'approved' ? `Approved, verified until ${item.verified_until ? longDate(item.verified_until) : ''}` : `Not approved${item.refunded ? ', refunded' : ''}: ${decisionReasonText(item.decision_reason)}`}</p>}
                      </div>
                      {tab === 'waiting' && <button className={primaryButton} onClick={() => { setMessage(''); setSelected(item) }}>Review</button>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function UploadSwitch({ queue, onOpened }: { queue: Queue; onOpened: (message: string) => Promise<void> }) {
  const [upgraded, setUpgraded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="font-display text-lg font-semibold text-amber-950">Uploads are locked</h2>
      <p className="mt-1 text-sm text-amber-900"><strong>{queue.paidWaiting}</strong> {queue.paidWaiting === 1 ? 'person has' : 'people have'} paid and {queue.paidWaiting === 1 ? 'is' : 'are'} waiting to upload. They were told to expect an email within 24 hours.</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-amber-900">
        <li>Upgrade the Supabase project to Pro (backups and 7-day logs).</li>
        <li>Accept Supabase&apos;s data processing agreement.</li>
        <li>Tick the box and open uploads. Everyone waiting is emailed.</li>
      </ol>
      {!queue.fileKeyReady && <p className="mt-3 text-sm font-semibold text-red-800" role="alert">The file encryption key (VERIFICATION_FILE_KEY) is not set in Vercel. Uploads cannot open without it.</p>}
      <label className="mt-4 flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={upgraded} onChange={(event) => setUpgraded(event.target.checked)} />
        <span className="text-sm font-medium text-amber-950">I&apos;ve upgraded Supabase to Pro and accepted the data processing agreement</span>
      </label>
      {error && <p className="mt-2 text-sm text-red-800" role="alert">{error}</p>}
      <button className={`${primaryButton} mt-4`} disabled={!upgraded || busy || !queue.fileKeyReady} onClick={async () => {
        if (!confirm('Open uploads? This cannot be turned off again while documents are stored.')) return
        setBusy(true); setError('')
        try {
          const result = await post('/api/admin/verifications/settings', { upgraded: true })
          await onOpened(`Uploads are open. ${result.emailed ?? 0} waiting job seeker${result.emailed === 1 ? ' was' : 's were'} emailed.`)
        } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not open uploads.') }
        setBusy(false)
      }}>{busy ? 'Opening…' : 'Open uploads'}</button>
      <p className="mt-2 text-xs text-amber-900">This can&apos;t be turned off again while documents are stored.</p>
    </section>
  )
}

function ReviewScreen({ item, onBack, onDone }: { item: Item; onBack: () => void; onDone: (message: string) => Promise<void> }) {
  const [ticked, setTicked] = useState<string[]>([])
  const [group, setGroup] = useState<RtwGroup | ''>(item.rtw_group_claimed ?? '')
  const [documentType, setDocumentType] = useState<RtwDocumentType | ''>('')
  const [expires, setExpires] = useState('')
  const [issued, setIssued] = useState('')
  const [notice, setNotice] = useState(false)
  const [mode, setMode] = useState<'approve' | 'reupload' | 'not_approved'>('approve')
  const [redo, setRedo] = useState<VerificationDocument[]>([])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Loaded on demand, so opening the screen alone does not log a file open.
  const [shown, setShown] = useState<VerificationDocument[]>([])

  const types = group ? RTW_GROUPS[group].documentTypes as readonly RtwDocumentType[] : []
  const allTicked = REVIEW_CHECKLIST.every((entry) => ticked.includes(entry.id))
  const until = issued ? verifiedUntil(issued, expires || null) : ''
  const approveReady = allTicked && !!group && !!documentType && !!issued && (group !== 'work_permit' || !!expires)
  const ready = mode === 'approve' ? approveReady : mode === 'reupload' ? redo.length > 0 && !!reason : !!reason

  async function decide() {
    const summary = mode === 'approve' ? `Approve ${item.name}? Their badge will run until ${longDate(until)}.`
      : mode === 'reupload' ? `Ask ${item.name} to upload again?`
        : `Mark ${item.name} as not approved and refund EC$40 now?`
    if (!confirm(summary)) return
    setBusy(true); setError('')
    try {
      const body = mode === 'approve'
        ? { decision: 'approve', rtw_group: group, rtw_document_type: documentType, rtw_document_expires_on: expires || null, police_record_issued_on: issued, sharing_notice: notice, checklist: ticked }
        : mode === 'reupload' ? { decision: 'reupload', documents: redo, reason } : { decision: 'not_approved', reason }
      const result = await post(`/api/admin/verifications/${item.id}`, body)
      const text = mode === 'approve' ? `${item.name} approved. The ID image has been deleted.`
        : mode === 'reupload' ? `${item.name} was asked to upload again.` : `${item.name} not approved. EC$40 refunded and files deleted.`
      await onDone(result.filesRemoved === false ? `${text} A file could not be removed straight away; tonight's job will remove it.` : text)
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'The decision was not saved.') }
    setBusy(false)
  }

  const viewer = (kind: VerificationDocument, title: string, available: boolean) => (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-semibold text-text">{title}</p>
        {shown.includes(kind) && <a className="text-xs font-semibold text-primary underline" href={`/api/admin/verifications/${item.id}/file?document=${kind}`} target="_blank" rel="noopener noreferrer">Open in new tab</a>}
      </div>
      {!available ? <p className="p-4 text-sm text-text-muted">No file.</p>
        : shown.includes(kind)
          ? <iframe title={title} src={`/api/admin/verifications/${item.id}/file?document=${kind}`} className="h-[70vh] w-full rounded-b-xl" />
          : <div className="p-4"><button className={quietButton} onClick={() => setShown([...shown, kind])}>Open document</button><p className="mt-2 text-xs text-text-muted">Each open is logged against your account.</p></div>}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <button className="text-sm font-semibold text-primary underline" onClick={onBack}>Back to queue</button>
      <header>
        <h1 className="font-display text-2xl font-bold text-text">{item.name}</h1>
        <p className="mt-1 text-sm text-text-light">Name on the JobLink profile. Chose: {item.rtw_group_claimed ? RTW_GROUPS[item.rtw_group_claimed].label : 'no group'}{item.submitted_at ? ` · submitted ${longDate(item.submitted_at)} (${hoursSince(item.submitted_at)} hours ago)` : ''}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {viewer('rtw', 'Right-to-work document', item.has_rtw_file)}
        {viewer('police_record', 'Police record', item.has_police_record_file)}
      </div>

      <section className={card}>
        <h2 className="font-display text-lg font-semibold text-text">Decision</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
          {([['approve', 'Approve'], ['reupload', 'Ask for re-upload'], ['not_approved', 'Not approved (refund)']] as const).map(([key, label]) => (
            <button key={key} role="radio" aria-checked={mode === key} onClick={() => { setMode(key); setReason(''); setError('') }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${mode === key ? 'bg-primary text-white' : 'border border-border bg-white text-text'}`}>{label}</button>
          ))}
        </div>

        {mode === 'approve' && (
          <div className="mt-5 space-y-5">
            <fieldset>
              <legend className="text-sm font-semibold text-text">Checklist</legend>
              <div className="mt-2 space-y-2">
                {REVIEW_CHECKLIST.map((entry) => (
                  <label key={entry.id} className="flex items-start gap-3 text-sm text-text">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={ticked.includes(entry.id)}
                      onChange={(event) => setTicked(event.target.checked ? [...ticked, entry.id] : ticked.filter((id) => id !== entry.id))} />
                    <span>{entry.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-text">Right-to-work group
                <select className={input} value={group} onChange={(event) => { setGroup(event.target.value as RtwGroup); setDocumentType('') }}>
                  <option value="">Choose</option>
                  {RTW_GROUP_KEYS.map((key) => <option key={key} value={key}>{RTW_GROUPS[key].label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-text">Document type
                <select className={input} value={documentType} onChange={(event) => setDocumentType(event.target.value as RtwDocumentType)} disabled={!group}>
                  <option value="">Choose</option>
                  {types.map((key) => <option key={key} value={key}>{RTW_DOCUMENT_TYPES[key]}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-text">Document expiry date{group === 'work_permit' ? ' (required)' : ' (if it has one)'}
                <input type="date" className={input} value={expires} min={antiguaToday()} onChange={(event) => setExpires(event.target.value)} />
              </label>
              <label className="text-sm font-medium text-text">Police record issue date
                <input type="date" className={input} value={issued} max={antiguaToday()} onChange={(event) => setIssued(event.target.value)} />
              </label>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-bg-alt p-3 text-sm text-text">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={notice} onChange={(event) => setNotice(event.target.checked)} />
              <span><strong>Show the job seeker a notice before sharing.</strong> Use this when the record shows a conviction marked as spent. They are told before anything is shared; it does not affect approval. Nothing about the record&apos;s contents is saved.</span>
            </label>
            {until && <p className="text-sm text-text-light">Badge would run until <strong className="text-text">{longDate(until)}</strong>.</p>}
          </div>
        )}

        {mode === 'reupload' && (
          <div className="mt-5 space-y-4">
            <fieldset>
              <legend className="text-sm font-semibold text-text">Which document?</legend>
              {(['rtw', 'police_record'] as const).map((kind) => (
                <label key={kind} className="mt-2 flex items-center gap-3 text-sm text-text">
                  <input type="checkbox" className="h-4 w-4" checked={redo.includes(kind)} onChange={(event) => setRedo(event.target.checked ? [...redo, kind] : redo.filter((value) => value !== kind))} />
                  {kind === 'rtw' ? 'Right-to-work document' : 'Police record'}
                </label>
              ))}
            </fieldset>
            <label className="block text-sm font-medium text-text">Reason (shown to the job seeker)
              <select className={input} value={reason} onChange={(event) => setReason(event.target.value)}>
                <option value="">Choose</option>
                {Object.entries(REUPLOAD_REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <p className="text-xs text-text-muted">The upload is free for them. The files being redone are deleted now.</p>
          </div>
        )}

        {mode === 'not_approved' && (
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-text">Reason (shown to the job seeker)
              <select className={input} value={reason} onChange={(event) => setReason(event.target.value)}>
                <option value="">Choose</option>
                {Object.entries(NOT_APPROVED_REASONS).filter(([key]) => key !== 'no_upload_received').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <p className="rounded-xl border border-border bg-bg-alt p-3 text-sm text-text">This refunds the EC$40 through Stripe in the same step, deletes both files and emails the job seeker. Employers are told nothing. What a genuine police record says is never a reason.</p>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className={primaryButton} disabled={!ready || busy} onClick={decide}>
            {busy ? 'Saving…' : mode === 'approve' ? 'Approve' : mode === 'reupload' ? 'Ask for re-upload' : 'Not approved, refund EC$40'}
          </button>
          <p className="text-xs text-text-muted">The ID image is deleted straight away, whatever the decision.</p>
        </div>
      </section>
    </div>
  )
}
