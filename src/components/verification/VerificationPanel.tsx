'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import VerifiedBadge, { ShieldCheckIcon } from '@/components/verification/VerifiedBadge'
import type { SeekerVerificationView, ShareView } from '@/lib/verification/seeker'
import {
  CONSENT_POINTS, CONSENT_VERSION, RTW_GROUPS, RTW_GROUP_KEYS, VERIFICATION_ACCEPT, VERIFICATION_FILES_PER_DOCUMENT,
  VERIFICATION_FILE_LIMIT, antiguaToday, daysBetween, decisionReasonText, formatConfirmationCode, longDate, type RtwGroup,
} from '@/lib/verification/shared'

interface State {
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
const PRIVACY_LINE = 'Your document image is deleted once it has been checked, and is never shown to employers.'

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: 'no-store' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Try again.')
  return body
}

/** Shrink a phone photo before sending it. The server re-saves every photo regardless. */
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

export default function VerificationPanel() {
  const [state, setState] = useState<State | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try { setState(await api('/api/verification')); setLoadError('') }
    catch (problem) { setLoadError(problem instanceof Error ? problem.message : 'Could not load your verification.') }
  }, [])
  useEffect(() => {
    let live = true
    api('/api/verification')
      .then((data) => { if (live) setState(data) })
      .catch((problem) => { if (live) setLoadError(problem instanceof Error ? problem.message : 'Could not load your verification.') })
    return () => { live = false }
  }, [])

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name); setError('')
    try { await action() } catch (problem) { setError(problem instanceof Error ? problem.message : 'Something went wrong. Try again.') }
    setBusy('')
  }

  if (loadError) return <div className="mx-auto max-w-2xl px-4 py-8"><Notice tone="error">{loadError} <button className="font-semibold underline" onClick={() => void load()}>Try again</button></Notice></div>
  if (!state) return <div className="mx-auto max-w-2xl px-4 py-8"><p className="text-sm text-text-light" role="status">Loading…</p></div>

  const { open, badge, last } = state
  const daysLeft = badge?.verified_until ? daysBetween(antiguaToday(), badge.verified_until) : null
  const expiring = !!badge?.valid && daysLeft !== null && daysLeft <= 30
  const canStart = !open && (!badge?.valid || expiring)

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-8">
      <header>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-text"><ShieldCheckIcon className="h-6 w-6 text-primary" /> JobLink Verified</h1>
        <p className="mt-1 text-sm text-text-light">Show employers you can work in Antigua. Free, and checked once.</p>
      </header>
      {error && <Notice tone="error">{error}</Notice>}

      {badge?.valid && <VerifiedSection state={state} badge={badge} daysLeft={daysLeft!} busy={busy} run={run} reload={load} />}

      {open?.status === 'submitted' && (
        <section className={card}>
          <h2 className="font-display text-lg font-semibold text-text">We&apos;re checking your document</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-light">We received it{open.submitted_at ? ` on ${longDate(open.submitted_at)}` : ''}. Checks are usually done within 48 hours, and we&apos;ll email you as soon as yours is.</p>
          <p className="mt-3 text-sm text-text-muted">{PRIVACY_LINE}</p>
        </section>
      )}

      {open?.status === 'reupload_needed' && state.uploadsOpen && (
        <UploadSection verificationId={open.id} reason={decisionReasonText(open.decision_reason)} group={open.rtw_group_claimed as RtwGroup | null} onDone={load} />
      )}

      {!open && !badge?.valid && last && <LastOutcome last={last} />}

      {canStart && (state.uploadsOpen
        ? <UploadSection verificationId="new" renewing={expiring} onDone={load} />
        : <section className={card}><p className="text-sm text-text">JobLink Verified is opening soon. Check back shortly.</p></section>)}
    </div>
  )
}

function LastOutcome({ last }: { last: SeekerVerificationView }) {
  if (last.status === 'not_approved') {
    return (
      <section className={card}>
        <h2 className="font-display text-lg font-semibold text-text">We couldn&apos;t verify your document</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-light">{decisionReasonText(last.decision_reason)}</p>
        <p className="mt-2 text-sm text-text-light">The image has been deleted, and employers are told nothing about this. You can try again with another document below.</p>
      </section>
    )
  }
  if (last.status === 'expired') {
    return (
      <section className={card}>
        <h2 className="font-display text-lg font-semibold text-text">Your badge has ended</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-light">{last.verified_until ? `It ended on ${longDate(last.verified_until)}, when the document checked expired or two years passed. ` : ''}Upload a current document below to get verified again. It&apos;s free.</p>
      </section>
    )
  }
  return null
}

function UploadSection({ verificationId, reason, group: initialGroup = null, renewing = false, onDone }: {
  verificationId: string; reason?: string; group?: RtwGroup | null; renewing?: boolean; onDone: () => Promise<void>
}) {
  const reupload = verificationId !== 'new'
  const [consent, setConsent] = useState(false)
  const [group, setGroup] = useState<RtwGroup | ''>(initialGroup ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const ready = consent && !!group && files.length > 0

  async function submit() {
    setSending(true); setError('')
    try {
      const prepared = await Promise.all(files.map(prepare))
      if (prepared.some((file) => file.size > VERIFICATION_FILE_LIMIT)) throw new Error('Each file can be up to 3 MB. Try a photo instead of a large scan.')
      if (prepared.reduce((total, file) => total + file.size, 0) > 3.8 * 1024 * 1024) throw new Error('These files are too large to send together. Try fewer or smaller files.')
      const form = new FormData()
      form.set('consent', 'yes')
      form.set('consent_version', CONSENT_VERSION)
      form.set('group', group)
      for (const file of prepared) form.append('files', file)
      await api(`/api/verification/${verificationId}/upload`, { method: 'POST', body: form })
      await onDone()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Upload failed. Try again.')
    }
    setSending(false)
  }

  return (
    <section className={card}>
      <h2 className="font-display text-lg font-semibold text-text">{reupload ? 'Send your document again' : renewing ? 'Renew your badge' : 'Get verified eligible to work in Antigua'}</h2>
      {reupload ? <div className="mt-3"><Notice tone="warning">{reason}</Notice></div> : (
        <p className="mt-2 text-sm leading-relaxed text-text-light">Upload your passport, ID card or work permit. A JobLink reviewer checks it is genuine, current and yours, usually within 48 hours. Employers then see a badge on your applications. It&apos;s free.</p>
      )}

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

      <div className="mt-5">
        <label className={`${quietButton} cursor-pointer ${sending ? 'pointer-events-none opacity-50' : ''}`}>
          {files.length ? 'Choose different files' : 'Choose file or take photo'}
          <input type="file" className="sr-only" accept={VERIFICATION_ACCEPT} multiple disabled={sending}
            onChange={(event) => { setFiles(Array.from(event.target.files ?? []).slice(0, VERIFICATION_FILES_PER_DOCUMENT)); event.target.value = '' }} />
        </label>
        {files.length > 0 && <p className="mt-2 text-sm text-text">{files.length} file{files.length === 1 ? '' : 's'} ready: {files.map((file) => file.name).join(', ')}</p>}
        <p className="mt-2 text-xs text-text-muted">PDF, JPG or PNG. Up to {VERIFICATION_FILES_PER_DOCUMENT} files, 3 MB each. Show the whole page with all four corners.</p>
      </div>

      <fieldset className="mt-5 rounded-xl border border-border bg-bg-alt p-4">
        <legend className="px-1 text-sm font-semibold text-text">Before you send it</legend>
        <ul className="mt-1 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-text-light">
          {CONSENT_POINTS.map((point) => <li key={point}>{point}</li>)}
        </ul>
        <label className="mt-4 flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span className="text-sm font-medium text-text">I agree to JobLink checking my document in this way.</span>
        </label>
      </fieldset>

      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <button className={`${primaryButton} mt-5 w-full sm:w-auto`} disabled={!ready || sending} onClick={submit}>{sending ? 'Sending…' : 'Send for checking'}</button>
      {!ready && <p className="mt-2 text-xs text-text-muted">{!group ? 'Choose how you are allowed to work.' : !files.length ? 'Choose your document.' : 'Tick the box to continue.'}</p>}
      <p className="mt-4 text-xs text-text-muted">Applying for jobs on JobLink never needs this. It&apos;s optional.</p>
    </section>
  )
}

function VerifiedSection({ state, badge, daysLeft, busy, run, reload }: {
  state: State; badge: SeekerVerificationView; daysLeft: number; busy: string
  run: (name: string, action: () => Promise<void>) => Promise<void>; reload: () => Promise<void>
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const info = { holdsWorkPermit: badge.rtw_group === 'work_permit', checkedOn: badge.reviewed_at || antiguaToday() }
  return (
    <>
      <section className={card}>
        <VerifiedBadge badge={info} />
        <h2 className="mt-4 font-display text-lg font-semibold text-text">Verified until {longDate(badge.verified_until!)}</h2>
        <p className="mt-1 text-sm text-text-light">{daysLeft <= 30 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left. Upload your new document below to keep your badge.` : 'Your badge shows on your profile, and you can send a confirmation with any application.'}</p>
        {badge.rtw_group === 'work_permit' && <p className="mt-3 text-sm text-text-light">Your confirmation says: &ldquo;Holds an Antigua work permit. A new employer would need to apply for a permit.&rdquo;</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <a className={quietButton} href="/api/verification/preview" target="_blank" rel="noopener noreferrer">Preview what employers see</a>
        </div>
        {badge.confirmation_code && <p className="mt-3 text-xs text-text-muted">Verification code: <span className="font-mono">{formatConfirmationCode(badge.confirmation_code)}</span></p>}
      </section>

      <section className={card}>
        <h2 className="font-display text-lg font-semibold text-text">Who has your confirmation</h2>
        {state.shares.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-text-light">Nobody yet. When you apply, tick &ldquo;Send my right-to-work confirmation&rdquo;. Nothing is sent unless you tick it.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {state.shares.map((share) => (
              <li key={share.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-text">{share.employer}</p>
                  <p className="text-sm text-text-light">{share.job_title} · sent {longDate(share.shared_at)}</p>
                  <p className="mt-1 text-xs text-text-muted">{share.views.length === 0 ? 'Not opened yet' : `Opened ${share.views.length} time${share.views.length === 1 ? '' : 's'}, last on ${longDate(share.views[0].viewed_at)}`}</p>
                </div>
                {share.revoked_at
                  ? <span className="shrink-0 text-xs font-medium text-text-muted">Sharing stopped</span>
                  : <button className="shrink-0 text-sm font-semibold text-red-700 underline disabled:opacity-50" disabled={!!busy}
                      onClick={() => run(`stop-${share.id}`, async () => { await api(`/api/verification/shares/${share.id}`, { method: 'DELETE' }); await reload() })}>
                      {busy === `stop-${share.id}` ? 'Stopping…' : 'Stop sharing'}
                    </button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-display text-lg font-semibold text-text">Remove my badge</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-light">This ends your badge now and stops all sharing. You can get verified again later for free.</p>
        {confirmRemove ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!!busy}
              onClick={() => run('remove', async () => { await api('/api/verification', { method: 'DELETE' }); setConfirmRemove(false); await reload() })}>
              {busy === 'remove' ? 'Removing…' : 'Yes, remove my badge'}
            </button>
            <button className={quietButton} disabled={!!busy} onClick={() => setConfirmRemove(false)}>Keep it</button>
          </div>
        ) : <button className="mt-4 text-sm font-semibold text-red-700 underline" onClick={() => setConfirmRemove(true)}>Remove my badge</button>}
      </section>
      <p className="text-center text-xs text-text-muted"><Link href="/verified" className="underline">About JobLink Verified</Link></p>
    </>
  )
}
