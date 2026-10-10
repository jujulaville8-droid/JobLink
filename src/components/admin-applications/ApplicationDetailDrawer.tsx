'use client'

import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, ArrowUpRight, FileText, X } from 'lucide-react'
import {
  APPLICATION_TIME_ZONE, UUID_PATTERN, applicantName, applicationStatusLabel,
  type ApplicationDetail,
} from '@/lib/admin-applications'
import styles from './ApplicationDetailDrawer.module.css'

export interface ApplicationDetailDrawerProps {
  applicationId: string | null
  jobId: string
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}

type LoadState = { phase: 'loading' | 'error' | 'closed' } | { phase: 'ready'; application: ApplicationDetail }
const nullableText = (value: unknown) => typeof value === 'string' ? value : null
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function readApplication(value: unknown, applicationId: string, jobId: string): ApplicationDetail {
  const application = record(record(value)?.application)
  const job = record(application?.job)
  if (!application || application.id !== applicationId || application.jobId !== jobId
    || (application.job != null && job?.id !== jobId)) throw new Error('Unavailable application')
  const company = record(job?.company)
  const applicant = record(application.applicant)
  const resume = record(application.resume)
  return {
    id: applicationId, jobId,
    appliedAt: nullableText(application.appliedAt) ?? '',
    status: nullableText(application.status) ?? '',
    coverLetterText: nullableText(application.coverLetterText),
    job: job ? {
      id: jobId, title: nullableText(job.title) ?? 'Job unavailable',
      company: company ? { id: nullableText(company.id) ?? '', name: nullableText(company.name) ?? 'Company unavailable' } : null,
    } : null,
    applicant: applicant ? {
      id: nullableText(applicant.id) ?? '', userId: nullableText(applicant.userId) ?? '',
      firstName: nullableText(applicant.firstName), lastName: nullableText(applicant.lastName),
      email: nullableText(applicant.email), phone: nullableText(applicant.phone), location: nullableText(applicant.location),
    } : null,
    resume: { label: 'Current résumé', uploadedHref: nullableText(resume?.uploadedHref), builtHref: nullableText(resume?.builtHref) },
    notificationTracking: 'not_tracked',
  }
}

function emailHref(value: string | null): string | undefined {
  if (!value || value.length > 254 || !/^[^\s@<>:"?]+@[^\s@<>:"?]+\.[^\s@<>:"?]+(?![\s\S])/.test(value)) return undefined
  return `mailto:${encodeURIComponent(value).replace('%40', '@')}`
}

function phoneHref(value: string | null): string | undefined {
  if (!value || !/^\+?[\d ().-]{5,32}(?![\s\S])/.test(value)) return undefined
  const number = value.replace(/[ ().-]/g, '')
  return number.replace('+', '').length >= 5 ? `tel:${number}` : undefined
}

function applicationDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-AG', {
    timeZone: APPLICATION_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(date)
}

// Remount on either identity change: private detail from a previous selection is
// never rendered for a newly selected application, even before effect cleanup.
export default function ApplicationDetailDrawer(props: ApplicationDetailDrawerProps) {
  return props.applicationId === null ? null : (
    <OpenApplicationDetailDrawer key={`${props.jobId}:${props.applicationId}`} {...props} applicationId={props.applicationId} />
  )
}

function OpenApplicationDetailDrawer({ applicationId, jobId, onClose, returnFocusRef }: ApplicationDetailDrawerProps & { applicationId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const releaseModalRef = useRef<(() => void) | null>(null)
  const dismissedRef = useRef(false)
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const titleId = useId()
  const letterId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const previousOverflow = document.body.style.overflow
    let released = false
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus({ preventScroll: true })
    const release = () => {
      if (released) return
      released = true
      if (dialog.open) dialog.close()
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
    releaseModalRef.current = release
    return () => { release(); releaseModalRef.current = null }
  }, [returnFocusRef])

  useEffect(() => {
    const controller = new AbortController()
    requestRef.current = controller
    async function load() {
      try {
        const response = await fetch(`/api/admin/applications/${encodeURIComponent(applicationId)}`, {
          method: 'GET', cache: 'no-store', signal: controller.signal,
        })
        if (!response.ok) throw new Error('Unavailable application')
        const application = readApplication(await response.json(), applicationId, jobId)
        if (!controller.signal.aborted && !dismissedRef.current) setState({ phase: 'ready', application })
      } catch {
        if (!controller.signal.aborted && !dismissedRef.current) setState({ phase: 'error' })
      }
    }
    void load()
    return () => { controller.abort(); if (requestRef.current === controller) requestRef.current = null }
  }, [applicationId, jobId, attempt])

  function dismiss() {
    if (dismissedRef.current) return
    dismissedRef.current = true
    requestRef.current?.abort()
    setState({ phase: 'closed' })
    releaseModalRef.current?.()
    onClose()
  }

  const detail = state.phase === 'ready' ? state.application : null
  const applicant = detail?.applicant ?? null
  const name = applicant ? applicantName(applicant) : 'Applicant unavailable'
  const initials = applicant ? [applicant.firstName, applicant.lastName].map(value => value?.trim().charAt(0) ?? '').join('').toUpperCase() || '?' : '?'
  // Only the current applicant's exact protected routes are usable. Storage
  // paths, signed/public URLs, external destinations and arbitrary schemes are ignored.
  const uploadedHref = detail && applicant && UUID_PATTERN.test(applicant.id)
    && detail.resume.uploadedHref === `/api/cv-download?profileId=${applicant.id}` ? detail.resume.uploadedHref : null
  const builtHref = detail && applicant && UUID_PATTERN.test(applicant.userId)
    && detail.resume.builtHref === `/api/cv/export?userId=${applicant.userId}` ? detail.resume.builtHref : null
  const primaryResume = uploadedHref ?? builtHref
  const coverLetter = detail?.coverLetterText?.trim() ?? ''
  const longLetter = coverLetter.length > 600

  return (
    <dialog ref={dialogRef} className={styles.drawer} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); dismiss() }}
      onClick={event => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss()
      }}>
      {state.phase !== 'closed' && <>
        <header className={styles.topbar}>
          <h2 id={titleId} className={styles.eyebrow}>Application details</h2>
          <button ref={closeRef} type="button" className={styles.close} aria-label="Close application details" onClick={dismiss}>
            <X size={18} aria-hidden="true" className={styles.desktopClose} />
            <span className={styles.mobileBack}><ArrowLeft size={18} aria-hidden="true" />Back</span>
          </button>
        </header>
        <div className={styles.body}>
          {state.phase === 'loading' && <p role="status" className={styles.state}>Loading application details…</p>}
          {state.phase === 'error' && <div className={styles.state}>
            <p role="alert">Application details are unavailable.</p>
            <button type="button" className={styles.secondaryButton} onClick={() => { setState({ phase: 'loading' }); setAttempt(value => value + 1) }}>Try again</button>
          </div>}
          {detail && <>
            <section className={styles.job} aria-label="Job">
              <p className={styles.eyebrow}>Application for</p>
              <h3 className={`font-display ${styles.jobTitle}`}>{detail.job?.title ?? 'Job unavailable'}</h3>
              <p className={styles.muted}>{detail.job?.company?.name ?? 'Company unavailable'}</p>
            </section>
            <section className={styles.identity} aria-label="Applicant">
              <div className={styles.avatar} aria-hidden="true">{initials}</div>
              <div className={styles.identityText}>
                <h3 className={styles.name}>{name}</h3>
                <span className={styles.status}>{applicationStatusLabel(detail.status)}</span>
              </div>
            </section>
            <div className={styles.date}>
              <span className={styles.label}>Applied</span>
              <p>{applicationDate(detail.appliedAt)}</p>
              <p className={styles.small}>Antigua time</p>
            </div>
            <section className={styles.section} aria-labelledby={`${titleId}-resume`}>
              <h3 id={`${titleId}-resume`} className={styles.sectionTitle}>Current résumé</h3>
              {primaryResume ? <a className={styles.primaryButton} href={primaryResume} target="_blank" rel="noopener noreferrer">
                <FileText size={17} aria-hidden="true" />View current résumé<ArrowUpRight size={16} aria-hidden="true" />
              </a> : <p className={styles.muted}>No current résumé available.</p>}
              {uploadedHref && builtHref && <a className={styles.textLink} href={builtHref} target="_blank" rel="noopener noreferrer">Built résumé<ArrowUpRight size={14} aria-hidden="true" /></a>}
              <p className={styles.small}>This is the applicant’s current profile résumé, not a snapshot from when they applied.</p>
            </section>
            <section className={styles.section} aria-labelledby={`${titleId}-letter`}>
              <h3 id={`${titleId}-letter`} className={styles.sectionTitle}>Cover letter</h3>
              {coverLetter ? <>
                <p id={letterId} className={styles.coverLetter}>{longLetter && !expanded ? `${coverLetter.slice(0, 600)}…` : coverLetter}</p>
                {longLetter && <button type="button" className={styles.textButton} aria-expanded={expanded} aria-controls={letterId} onClick={() => setExpanded(value => !value)}>{expanded ? 'Collapse' : 'Expand'}</button>}
              </> : <p className={styles.muted}>No cover letter provided.</p>}
            </section>
            <section className={styles.section} aria-labelledby={`${titleId}-contact`}>
              <h3 id={`${titleId}-contact`} className={styles.sectionTitle}>Contact</h3>
              <dl className={styles.contacts}>
                <div><dt>Email</dt><dd>{emailHref(applicant?.email ?? null) ? <a href={emailHref(applicant?.email ?? null)}>{applicant?.email}</a> : applicant?.email || 'Not provided'}</dd></div>
                <div><dt>Phone</dt><dd>{phoneHref(applicant?.phone ?? null) ? <a href={phoneHref(applicant?.phone ?? null)}>{applicant?.phone}</a> : applicant?.phone || 'Not provided'}</dd></div>
                <div><dt>Location</dt><dd>{applicant?.location || 'Not provided'}</dd></div>
              </dl>
            </section>
            <section className={styles.notification} aria-labelledby={`${titleId}-notification`}>
              <h3 id={`${titleId}-notification`} className={styles.sectionTitle}>Employer notification</h3>
              <p className={styles.label}>Not tracked</p>
              <p className={styles.small}>Delivery and read status are not recorded for this application.</p>
            </section>
          </>}
        </div>
      </>}
    </dialog>
  )
}
