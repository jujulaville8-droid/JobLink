'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { supportSchema, SUPPORT_RETRY_WINDOW_MS } from '@/lib/support'
import { useSupportClearance } from './useSupportClearance'
import styles from './SupportButton.module.css'

const FADE_MS = 180

export default function SupportButton() {
  const widgetRef = useSupportClearance()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('opening')
  const [draft, setDraft] = useState({ name: '', email: '', message: '', consent: false, website: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openingFrame = useRef<number | null>(null)
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sending = useRef(false)
  const attempt = useRef<{ signature: string; id: string; created_at: number } | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const messageHintId = useId()
  const messageId = useId()
  const dialogId = useId()

  function openSupport() {
    if (closingTimer.current !== null) { clearTimeout(closingTimer.current); closingTimer.current = null }
    setPhase(open || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'open' : 'opening')
    setOpen(true)
  }

  function closeSupport() {
    if (phase === 'closing') return
    if (openingFrame.current !== null) { cancelAnimationFrame(openingFrame.current); openingFrame.current = null }
    setPhase('closing')
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setOpen(false); return }
    closingTimer.current = setTimeout(() => { closingTimer.current = null; setOpen(false) }, FADE_MS)
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const previousOverflow = document.body.style.overflow
    const opener = openerRef.current
    if (!dialog.open) dialog.showModal()
    document.body.style.overflow = 'hidden'
    // Avoid opening a mobile keyboard before the visitor has read the form.
    closeRef.current?.focus({ preventScroll: true })
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // Paint the transparent panel before advancing to its visible state.
      openingFrame.current = requestAnimationFrame(() => {
        openingFrame.current = requestAnimationFrame(() => {
          openingFrame.current = null
          setPhase(current => current === 'opening' ? 'open' : current)
        })
      })
    }
    return () => {
      if (openingFrame.current !== null) { cancelAnimationFrame(openingFrame.current); openingFrame.current = null }
      if (closingTimer.current !== null) { clearTimeout(closingTimer.current); closingTimer.current = null }
      if (dialog.open) dialog.close()
      document.body.style.overflow = previousOverflow
      opener?.focus({ preventScroll: true })
    }
  }, [open])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    if (!event.currentTarget.checkValidity()) { event.currentTarget.reportValidity(); return }
    const signature = JSON.stringify({ ...draft, name: draft.name.trim(), email: draft.email.trim().toLowerCase(), message: draft.message.trim() })
    if (!attempt.current || attempt.current.signature !== signature) {
      attempt.current = { signature, id: crypto.randomUUID(), created_at: Date.now() }
    }
    const payload = supportSchema.safeParse({ ...draft, ...attempt.current })
    if (!payload.success) { setError('Please check your name, reply email, message (10–5,000 characters), and consent.'); return }
    if (Date.now() - payload.data.created_at > SUPPORT_RETRY_WINDOW_MS) {
      setError(`This attempt has expired. Keep your draft and ask support to check reference ${payload.data.id} before sending it again.`)
      return
    }
    sending.current = true
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.data), signal: AbortSignal.timeout(20000),
      })
      const body = await response.json()
      if (!response.ok || body.success !== true || body.reference !== payload.data.id) {
        setError(typeof body.error === 'string' ? body.error : "We couldn't confirm sending your message. Your draft is still here. Retry the same message to avoid duplicates.")
        return
      }
      setReference(body.reference)
      setDraft({ name: '', email: '', message: '', consent: false, website: '' })
    } catch {
      setError("We couldn't confirm sending your message. Your draft is still here. Retry the same message to avoid duplicates.")
    } finally { sending.current = false; setBusy(false) }
  }

  return <div ref={widgetRef}>
    <button ref={openerRef} type="button" className={styles.trigger} data-hidden={open} aria-hidden={open || undefined} aria-label="Support" title="Contact support — replies by email" aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} onClick={openSupport}>
      <MessageCircle size={25} aria-hidden="true" />
    </button>
    <dialog ref={dialogRef} id={dialogId} className={styles.dialog} data-phase={phase} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); closeSupport() }} onClose={event => { if (!event.currentTarget.open) setOpen(false) }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, textarea, [tabindex]'))
          .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && !control.closest('[aria-hidden="true"]'))
        if (!controls.length) return
        // Safari's default Tab navigation can skip checkbox/link/button controls.
        // Advance explicitly so consent and actions stay reachable in the modal.
        const current = controls.indexOf(document.activeElement as HTMLElement)
        const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
          : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
        event.preventDefault()
        controls[next].focus()
      }}>
      <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.heading}><MessageCircle size={20} aria-hidden="true" /><div><h2 id={titleId}>JobLink support</h2><p>Replies by email</p></div></div>
        <button ref={closeRef} type="button" className={styles.close} aria-label="Close support" onClick={closeSupport}><X size={22} aria-hidden="true" /></button>
      </div>
      <div className={styles.body}>
      <p id={descriptionId} className={styles.description}>Send us a message about JobLink. We’ll reply to your email.</p>
      {reference ? <div role="status" className={styles.receipt}>
        <h3>Message accepted for sending</h3>
        <p>Our email provider accepted your message for support. This does not confirm inbox delivery.</p>
        <p className={styles.reference}>Reference: {reference}</p>
        <button type="button" className={styles.submit} onClick={() => { setReference(''); attempt.current = null }}>Write another message</button>
      </div> : <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className={styles.fields}>
          <label>Your name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} name="name" autoComplete="name" maxLength={100} required /></label>
          <label>Reply email<input value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <div><label htmlFor={messageId}>Message</label><textarea id={messageId} value={draft.message} onChange={event => setDraft({ ...draft, message: event.target.value })} name="message" minLength={10} maxLength={5000} rows={3} aria-describedby={messageHintId} required /></div>
          <p id={messageHintId} className={styles.hint}>10–5,000 characters. Leave out passwords, payment details, and others’ private information.</p>
          <div className={styles.honeypot} aria-hidden="true"><label>Leave this empty<input name="website" value={draft.website} onChange={event => setDraft({ ...draft, website: event.target.value })} tabIndex={-1} autoComplete="off" maxLength={300} /></label></div>
          <label className={styles.consent}><input name="consent" type="checkbox" checked={draft.consent} onChange={event => setDraft({ ...draft, consent: event.target.checked })} required /><span>I agree to email my name, reply email, and message to JobLink support and be contacted about this request. <a href="/privacy" target="_blank" rel="noopener noreferrer" aria-label="Privacy policy (opens in a new tab)">Privacy policy ↗</a></span></label>
        </fieldset>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button type="submit" className={styles.submit} disabled={busy}>{busy ? 'Sending message…' : 'Send message'}</button>
      </form>}
      </div>
      </div>
      {/* The active launcher belongs to the modal's top layer so it can receive
          clicks while the rest of the page is inert. */}
      <button type="button" className={styles.trigger} aria-label={phase === 'closing' ? 'Open support panel' : 'Close support panel'} title={phase === 'closing' ? 'Open support panel' : 'Close support panel'} aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={phase !== 'closing'} onClick={phase === 'closing' ? openSupport : closeSupport}>
        <X size={25} aria-hidden="true" />
      </button>
    </dialog>
  </div>
}
