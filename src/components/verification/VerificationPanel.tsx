'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import VerifiedBadge, { ShieldCheckIcon } from '@/components/verification/VerifiedBadge'
import type { SeekerVerificationView, ShareView } from '@/lib/verification/seeker'
import {
  CONSENT_POINTS, CONSENT_VERSION, DOCUMENT_LABELS, NOT_APPROVED_REASONS, RTW_GROUPS, RTW_GROUP_KEYS,
  VERIFICATION_ACCEPT, VERIFICATION_FILES_PER_DOCUMENT, VERIFICATION_FILE_LIMIT, antiguaToday, daysBetween,
  decisionReasonText, formatConfirmationCode, longDate, type RtwGroup, type VerificationDocument,
} from '@/lib/verification/shared'

interface State {
  checkoutEnabled: boolean
  uploadsOpen: boolean
  open: SeekerVerificationView | null
  badge: SeekerVerificationView | null
  last: SeekerVerificationView | null
  shares: ShareView[]
  name: string
}

const card = 'rounded-2xl border border-border bg-surface p-5 sm:p-6'
const primaryButton = 'inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-50'
const quietButton = 'inline-flex items-center justify-center rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-text disabled:opacity-50'
const PRIVACY_LINE = 'Your ID is deleted once checked and never shared. Your police record is stored privately, and only employers you choose can see it.'

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: 'no-store' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Try again.')
  return body
}

/**
 * Shrink a phone photo before sending it: faster on mobile data and well
 * inside the upload limit. PDFs and small images go as they are. The server
 * re-saves every photo again regardless, so this is a convenience, not a check.
 */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 900 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    return blob && blob.size < file.size ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning' | 'error'; children: React.ReactNode }) {
  const tones = {
    info: 'border-border bg-bg-alt text-text',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800',
  }
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-4 text-sm leading-relaxed ${tones[tone]}`}>{children}</div>
}

function Steps({ current }: { current: number }) {
  const steps = ['Pay', 'Upload', 'Review', 'Verified']
  return (
    <ol className="flex items-center gap-2 text-xs font-medium" aria-label="Progress">
      {steps.map((label, index) => (
        <li key={label} className="flex flex-1 items-center gap-2" aria-current={index === current ? 'step' : undefined}>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${index < current ? 'bg-primary text-white' : index === current ? 'border-2 border-primary text-primary' : 'border border-border text-text-muted'}`}>
            {index < current ? '✓' : index + 1}
          </span>
          <span className={index <= current ? 'text-text' : 'text-text-muted'}>{label}</span>
          {index < steps.length - 1 && <span className="hidden h-px flex-1 bg-border sm:block" />}
        </li>
      ))}
    </ol>
  )
}

export default function VerificationPanel({ justPaid, cancelled }: { justPaid: boolean; cancelled: boolean }) {
  const [state, setState] = useState<State | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const polls = useRef(0)

  const load = useCallback(async () => {
    try {
      setState(await api('/api/verification'))
      setLoadError('')
    } catch (problem) {
      setLoadError(problem instanceof Error ? problem.message : 'Could not load your verification.')
    }
  }, [])
  useEffect(() => {
    let live = true
    api('/api/verification')
      .then((data) => { if (live) setState(data) })
      .catch((problem) => { if (live) setLoadError(problem instanceof Error ? problem.message : 'Could not load your verification.') })
    return () => { live = false }
  }, [])

  // Back from Stripe: the webhook may land a moment after the redirect.
  useEffect(() => {
    if (!justPaid || !state || polls.current >= 8) return
    if (state.open && state.open.status !== 'awaiting_payment') return
    const timer = setTimeout(() => { polls.current++; void load() }, 2500)
    return () => clearTimeout(timer)
  }, [justPaid, state, load])

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name)
    setError('')
    try { await action() } catch (problem) { setError(problem instanceof Error ? problem.message : 'Something went wrong. Try again.') }
    setBusy('')
  }

  const pay = () => run('pay', async () => {
    const { url } = await api('/api/verification/checkout', { method: 'POST' })
    window.location.assign(url)
  })

  if (loadError) return <div className="mx-auto max-w-2xl px-4 py-8"><Notice tone="error">{loadError} <button className="font-semibold underline" onClick={() => void load()}>Try again</button></Notice></div>
  if (!state) return <div className="mx-auto max-w-2xl px-4 py-8"><p className="text-sm text-text-light" role="status">Loading…</p></div>

  const { open, badge, last } = state
  const today = antiguaToday()
  const daysLeft = badge?.verified_until ? daysBetween(today, badge.verified_until) : null
  const expiring = !!badge?.valid && daysLeft !== null && daysLeft <= 30
  const waitingForWebhook = justPaid && (!open || open.status === 'awaiting_payment')
  const canStart = !badge?.valid && (!open || open.status === 'awaiting_payment')

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-8">
      <header>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-text"><ShieldCheckIcon className="h-6 w-6 text-primary" /> JobLink Verified</h1>
        <p className="mt-1 text-sm text-text-light">Police record and right to work, sorted before you apply.</p>
      </header>

      {error && <Notice tone="error">{error}</Notice>}
      {cancelled && canStart && <Notice>Payment was cancelled. You have not been charged.</Notice>}

      {/* Verified */}
      {badge?.valid && (
        <VerifiedSection state={state} badge={badge} daysLeft={daysLeft!} busy={busy} run={run} reload={load} />
      )}

      {/* Expiring: renew */}
      {expiring && !open && (
        <section className={card}>
          <h2 className="font-display text-lg font-semibold text-text">Your badge ends on {longDate(badge!.verified_until!)}</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-light">Renewing is a new EC$40 check with a new police record issued in the last 30 days. Your new badge replaces this one as soon as it is approved. Nothing renews by itself.</p>
          {state.checkoutEnabled
            ? <button className={`${primaryButton} mt-4`} disabled={!!busy} onClick={pay}>{busy === 'pay' ? 'Opening payment…' : 'Renew, EC$40'}</button>
            : <p className="mt-3 text-sm text-text-muted">Renewals are paused at the moment. Please check back soon.</p>}
        </section>
      )}

      {/* In progress */}
      {waitingForWebhook && (
        <section className={card}><Steps current={1} /><div className="mt-5"><Notice>Confirming your payment. This usually takes a few seconds…</Notice></div></section>
      )}

      {!waitingForWebhook && open?.status === 'paid' && !state.uploadsOpen && (
        <section className={card}>
          <Steps current={1} />
          <h2 className="mt-5 font-display text-lg font-semibold text-text">Payment received</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-light">We&apos;ll email you within 24 hours when your upload is ready. You don&apos;t need to do anything until then.</p>
          <p className="mt-3 text-sm text-text-light">While you wait: <Link href="/guides/police-record" className="font-semibold text-primary underline">how to get your police record in Antigua</Link>.</p>
        </section>
      )}

      {!waitingForWebhook && state.uploadsOpen && (open?.status === 'paid' || open?.status === 'reupload_needed') && (
        <UploadSection verification={open} onChange={(verification) => setState({ ...state, open: verification })} onSubmitted={load} />
      )}

      {open?.status === 'submitted' && (
        <section className={card}>
          <Steps current={2} />
          <h2 className="mt-5 font-display text-lg font-semibold text-text">Under review</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-light">We received your right-to-work document and your police record{open.submitted_at ? ` on ${longDate(open.submitted_at)}` : ''}. Reviews are usually done within 48 hours, and we&apos;ll email you as soon as yours is.</p>
          <p className="mt-3 text-sm text-text-muted">{PRIVACY_LINE}</p>
        </section>
      )}

      {/* Finished without a badge */}
      {!open && !badge?.valid && last && <LastOutcome last={last} />}

      {/* Not started, expired or refunded: the offer */}
      {canStart && !waitingForWebhook && (
        <section className={card}>
          {!last && <Steps current={0} />}
          <h2 className={`${last ? '' : 'mt-5 '}font-display text-lg font-semibold text-text`}>{last?.status === 'expired' || last?.status === 'withdrawn' ? 'Get verified again' : 'Get verified once. Send your documents with any application.'}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="font-semibold text-text">What we check</dt><dd className="mt-0.5 leading-relaxed text-text-light">A right-to-work document (ID, passport, Skills Certificate or work permit) and a police record issued in the last 30 days. We check they are genuine, recent and yours. We never judge what the record says.</dd></div>
            <div><dt className="font-semibold text-text">Price</dt><dd className="mt-0.5 leading-relaxed text-text-light">EC$40 verification fee, paid once, for 6 months of verified documents. No subscription. If we can&apos;t verify you, we refund you in full.</dd></div>
            <div><dt className="font-semibold text-text">Who sees what</dt><dd className="mt-0.5 leading-relaxed text-text-light">{PRIVACY_LINE}</dd></div>
          </dl>
          <div className="mt-4"><Notice tone="success"><strong>Applying is always free.</strong> Verified is optional, and you never need it to apply, browse, build a resume or message employers.</Notice></div>
          {state.checkoutEnabled ? (
            <>
              <button className={`${primaryButton} mt-5 w-full sm:w-auto`} disabled={!!busy} onClick={pay}>{busy === 'pay' ? 'Opening payment…' : last?.status === 'expired' ? 'Renew, EC$40' : 'Get verified, EC$40'}</button>
              <p className="mt-2 text-xs text-text-muted">EC$40 verification fee. Covers checking your documents and storing your police record securely for 6 months. Secure card payment by Stripe.</p>
            </>
          ) : <p className="mt-5 text-sm font-medium text-text">Verified is opening soon. Check back shortly.</p>}
          <p className="mt-4 text-sm"><Link href="/verified" className="font-semibold text-primary underline">More about Verified</Link> · <Link href="/guides/police-record" className="font-semibold text-primary underline">How to get a police record</Link></p>
        </section>
      )}
    </div>
  )
}

function LastOutcome({ last }: { last: SeekerVerificationView }) {
  if (last.status === 'not_approved' || (last.status === 'withdrawn' && last.refunded_at)) {
    const reason = decisionReasonText(last.decision_reason) || NOT_APPROVED_REASONS.document_not_accepted
    return (
      <section className={card}>
        <h2 className="font-display text-lg font-semibold text-text">We couldn&apos;t verify your documents</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-light">{reason}</p>
        <div className="mt-4"><Notice>We refunded your <strong>EC$40</strong> verification fee in full{last.refunded_at ? ` on ${longDate(last.refunded_at)}` : ''}. It usually reaches your card within 5 to 10 business days. Your uploaded files have been deleted, and employers are told nothing about this.</Notice></div>
      </section>
    )
  }
  if (last.status === 'expired') {
    return (
      <section className={card}>
        <h2 className="font-display text-lg font-semibold text-text">Your badge has ended</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-light">{last.verified_until ? `It ended on ${longDate(last.verified_until)}. ` : ''}The badge has been removed and your stored police record deleted. Renewing is a new EC$40 check with a new police record issued in the last 30 days.</p>
      </section>
    )
  }
  return (
    <section className={card}>
      <h2 className="font-display text-lg font-semibold text-text">Your documents were deleted</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-light">You deleted your documents, so your badge has ended. You can get verified again at any time.</p>
    </section>
  )
}

function UploadSection({ verification, onChange, onSubmitted }: {
  verification: SeekerVerificationView
  onChange: (verification: SeekerVerificationView) => void
  onSubmitted: () => Promise<void>
}) {
  const reupload = verification.status === 'reupload_needed'
  const [consent, setConsent] = useState(false)
  const [group, setGroup] = useState<RtwGroup | ''>((verification.rtw_group_claimed as RtwGroup) || '')
  const [uploading, setUploading] = useState<VerificationDocument | 'submit' | ''>('')
  const [errors, setErrors] = useState<Partial<Record<VerificationDocument | 'submit', string>>>({})

  const needed = (kind: VerificationDocument) => !reupload || verification.reupload_documents.includes(kind)
  const has = { rtw: verification.has_rtw_file, police_record: verification.has_police_record_file }
  const ready = consent && !!group && has.rtw && has.police_record

  async function send(kind: VerificationDocument, list: FileList | null) {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setErrors((current) => ({ ...current, [kind]: undefined }))
    if (!consent) return setErrors((current) => ({ ...current, [kind]: 'Tick the consent box above first.' }))
    if (files.length > VERIFICATION_FILES_PER_DOCUMENT) return setErrors((current) => ({ ...current, [kind]: `Choose up to ${VERIFICATION_FILES_PER_DOCUMENT} files.` }))
    setUploading(kind)
    try {
      const prepared = await Promise.all(files.map(prepare))
      if (prepared.some((file) => file.size > VERIFICATION_FILE_LIMIT)) throw new Error('Each file can be up to 3 MB. Try a photo instead of a large scan.')
      if (prepared.reduce((total, file) => total + file.size, 0) > 3.8 * 1024 * 1024) throw new Error('These files are too large to send together. Try fewer or smaller files.')
      const form = new FormData()
      form.set('action', 'document')
      form.set('document', kind)
      form.set('consent', 'yes')
      form.set('consent_version', CONSENT_VERSION)
      for (const file of prepared) form.append('files', file)
      const result = await api(`/api/verification/${verification.id}/upload`, { method: 'POST', body: form })
      onChange(result.verification)
    } catch (problem) {
      setErrors((current) => ({ ...current, [kind]: problem instanceof Error ? problem.message : 'Upload failed. Try again.' }))
    }
    setUploading('')
  }

  async function submit() {
    setUploading('submit')
    setErrors((current) => ({ ...current, submit: undefined }))
    try {
      const form = new FormData()
      form.set('action', 'submit')
      form.set('consent', 'yes')
      form.set('consent_version', CONSENT_VERSION)
      form.set('group', group)
      await api(`/api/verification/${verification.id}/upload`, { method: 'POST', body: form })
      await onSubmitted()
    } catch (problem) {
      setErrors((current) => ({ ...current, submit: problem instanceof Error ? problem.message : 'Could not send. Try again.' }))
    }
    setUploading('')
  }

  const slot = (kind: VerificationDocument, title: string, help: string) => (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-text-light">{help}</p>
        </div>
        {has[kind] && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Uploaded</span>}
      </div>
      {needed(kind) ? (
        <>
          <label className={`${quietButton} mt-3 cursor-pointer ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            {uploading === kind ? 'Uploading…' : has[kind] ? 'Replace' : 'Choose file or take photo'}
            <input type="file" className="sr-only" accept={VERIFICATION_ACCEPT} multiple disabled={!!uploading}
              onChange={(event) => { void send(kind, event.target.files); event.target.value = '' }} />
          </label>
          <p className="mt-2 text-xs text-text-muted">PDF, JPG or PNG. Up to {VERIFICATION_FILES_PER_DOCUMENT} files, 3 MB each. Show the whole page with all four corners.</p>
        </>
      ) : <p className="mt-3 text-xs text-text-muted">We already have this one. No need to upload it again.</p>}
      {errors[kind] && <p className="mt-2 text-sm text-red-700" role="alert">{errors[kind]}</p>}
    </div>
  )

  return (
    <section className={card}>
      <Steps current={1} />
      <h2 className="mt-5 font-display text-lg font-semibold text-text">{reupload ? 'Upload again' : 'Upload your documents'}</h2>
      {reupload ? (
        <div className="mt-3"><Notice tone="warning">
          <strong>{verification.reupload_documents.map((kind) => DOCUMENT_LABELS[kind]).join(' and ')}:</strong> {decisionReasonText(verification.decision_reason)} Uploading again is free.
        </Notice></div>
      ) : <p className="mt-2 text-sm text-text-light">Payment received. Two uploads and you&apos;re done.</p>}

      <fieldset className="mt-5 rounded-xl border border-border bg-bg-alt p-4">
        <legend className="px-1 text-sm font-semibold text-text">Consent for your police record</legend>
        <ul className="mt-1 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-text-light">
          {CONSENT_POINTS.map((point) => <li key={point}>{point}</li>)}
        </ul>
        <label className="mt-4 flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span className="text-sm font-medium text-text">I agree to JobLink handling my police record and right-to-work document in this way.</span>
        </label>
      </fieldset>

      {!reupload && (
        <div className="mt-5">
          <label htmlFor="rtw-group" className="text-sm font-semibold text-text">How are you allowed to work in Antigua and Barbuda?</label>
          <select id="rtw-group" value={group} onChange={(event) => setGroup(event.target.value as RtwGroup)} className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text">
            <option value="">Choose one</option>
            {RTW_GROUP_KEYS.map((key) => <option key={key} value={key}>{RTW_GROUPS[key].label}</option>)}
          </select>
          {group && <p className="mt-2 text-sm text-text-light"><strong className="text-text">Upload:</strong> {RTW_GROUPS[group].proof}.{RTW_GROUPS[group].hint ? ` ${RTW_GROUPS[group].hint}.` : ''}</p>}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {slot('rtw', '1. Right-to-work document', group ? `${RTW_GROUPS[group].proof}. If that is more than one document, add each as its own file.` : 'Choose your group above to see what to upload.')}
        {slot('police_record', '2. Police record', 'Issued in the last 30 days by the Criminal Records Office.')}
      </div>

      {errors.submit && <p className="mt-3 text-sm text-red-700" role="alert">{errors.submit}</p>}
      <button className={`${primaryButton} mt-5 w-full sm:w-auto`} disabled={!ready || !!uploading} onClick={submit}>
        {uploading === 'submit' ? 'Sending…' : reupload ? 'Upload again' : 'Submit for review'}
      </button>
      {!ready && <p className="mt-2 text-xs text-text-muted">{!consent ? 'Tick the consent box to continue.' : !group ? 'Choose how you are allowed to work.' : 'Upload both documents to continue.'}</p>}
      <p className="mt-4 text-xs text-text-muted">{PRIVACY_LINE}</p>
    </section>
  )
}

function VerifiedSection({ state, badge, daysLeft, busy, run, reload }: {
  state: State
  badge: SeekerVerificationView
  daysLeft: number
  busy: string
  run: (name: string, action: () => Promise<void>) => Promise<void>
  reload: () => Promise<void>
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const info = { holdsWorkPermit: badge.rtw_group === 'work_permit', checkedOn: badge.reviewed_at || antiguaToday() }
  const active = state.shares.filter((share) => !share.revoked_at)

  return (
    <>
      <section className={card}>
        <Steps current={4} />
        <h2 className="mt-5 font-display text-lg font-semibold text-text">Verified until {longDate(badge.verified_until!)}</h2>
        <p className="mt-1 text-sm text-text-light">{daysLeft <= 30 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left.` : 'This badge shows on your profile and on applications where you send your documents.'}</p>
        <div className="mt-4"><VerifiedBadge badge={info} /></div>
        {badge.rtw_group === 'work_permit' && <p className="mt-3 text-sm text-text-light">Your badge and confirmation say: &ldquo;Holds an Antigua work permit. A new employer would need to apply for a permit.&rdquo;</p>}

        {badge.sharing_notice && (
          <div className="mt-4"><Notice tone="warning">
            <strong>Please read before you share your police record.</strong> Our reviewer noticed that your police record shows an entry marked as spent. Under the Criminal Records (Rehabilitation of Offenders) Act you don&apos;t have to disclose a spent conviction, and it is an offence for an employer to exclude you because of one. Sending your police record is always your choice. Preview it below, and tick it on an application only if you are happy for that employer to see it.
          </Notice></div>
        )}

        <h3 className="mt-6 text-sm font-semibold text-text">Preview what employers see</h3>
        <p className="mt-1 text-sm text-text-light">Open the exact stamped copies an employer would get, before you share anything.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className={quietButton} href="/api/verification/preview?document=police_record" target="_blank" rel="noopener noreferrer">Preview police record</a>
          <a className={quietButton} href="/api/verification/preview?document=rtw" target="_blank" rel="noopener noreferrer">Preview right-to-work confirmation</a>
        </div>
        {badge.confirmation_code && <p className="mt-3 text-xs text-text-muted">Verification code: <span className="font-mono">{formatConfirmationCode(badge.confirmation_code)}</span></p>}
      </section>

      <section className={card}>
        <h2 className="font-display text-lg font-semibold text-text">Who has your documents</h2>
        {state.shares.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-text-light">Nobody yet. When you apply for a job, tick &ldquo;Send my verified documents&rdquo; to send them with that application. Nothing is ever sent unless you tick it.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {state.shares.map((share) => (
              <li key={share.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-text">{share.employer}</p>
                    <p className="text-sm text-text-light">{share.job_title} · sent {longDate(share.shared_at)}</p>
                    <p className="mt-0.5 text-xs text-text-muted">{[share.share_police_record && 'Police record', share.share_rtw && 'Right to work'].filter(Boolean).join(' and ')}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {share.views.length === 0 ? 'Not opened yet' : `Opened ${share.views.length} time${share.views.length === 1 ? '' : 's'}, last on ${longDate(share.views[0].viewed_at)}`}
                    </p>
                  </div>
                  {share.revoked_at
                    ? <span className="shrink-0 text-xs font-medium text-text-muted">Sharing stopped</span>
                    : <button className="shrink-0 text-sm font-semibold text-red-700 underline disabled:opacity-50" disabled={!!busy}
                        onClick={() => run(`stop-${share.id}`, async () => { await api(`/api/verification/shares/${share.id}`, { method: 'DELETE' }); await reload() })}>
                        {busy === `stop-${share.id}` ? 'Stopping…' : 'Stop sharing'}
                      </button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {active.length > 0 && <p className="mt-3 text-xs text-text-muted">Stopping sharing means that employer can no longer open your documents on JobLink. Copies they already downloaded are theirs to keep.</p>}
      </section>

      <section className={card}>
        <h2 className="font-display text-lg font-semibold text-text">Delete my documents</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-light">This deletes your stored police record, stops all sharing and ends your badge now. The verification fee is not refunded. To remove everything JobLink holds about you, delete your account in <Link href="/settings" className="font-semibold text-primary underline">Settings</Link>.</p>
        {confirmDelete ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!!busy}
              onClick={() => run('delete', async () => { await api('/api/verification', { method: 'DELETE' }); setConfirmDelete(false); await reload() })}>
              {busy === 'delete' ? 'Deleting…' : 'Yes, delete and end my badge'}
            </button>
            <button className={quietButton} disabled={!!busy} onClick={() => setConfirmDelete(false)}>Keep my badge</button>
          </div>
        ) : <button className="mt-4 text-sm font-semibold text-red-700 underline" onClick={() => setConfirmDelete(true)}>Delete my documents</button>}
      </section>
    </>
  )
}
