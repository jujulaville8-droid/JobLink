'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './studio.module.css';
import { writingStatusLabels, type ResumeWritingOrder, type WritingConfig } from '@/lib/resume-writing';

const intakeFields = [
  { key: 'name', label: 'Name for your résumé', required: true, maxLength: 120 },
  { key: 'email', label: 'Delivery email', required: true, type: 'email', maxLength: 254 },
  { key: 'role', label: 'Type of job you want', required: true, maxLength: 150 },
  { key: 'education', label: 'Education and training (optional)', multiline: true, maxLength: 1500 },
  { key: 'skills', label: 'Skills and strengths (optional)', multiline: true, maxLength: 1500 },
  { key: 'experience', label: 'Experience and responsibilities (optional)', multiline: true, maxLength: 2000 },
] as const;
type IntakeKey = typeof intakeFields[number]['key'];
type IntakeDraft = Record<IntakeKey, string>;
const emptyDraft: IntakeDraft = { name: '', email: '', role: '', education: '', skills: '', experience: '' };

// Server configuration gates saving and checkout; both are disabled by default.
type OfferData = { config: WritingConfig; orders: ResumeWritingOrder[] };
const disabledData: OfferData = { config: { intakeEnabled: false, checkoutEnabled: false, terms: null }, orders: [] };
export default function ResumeWritingOffer({ initialData }: { initialData?: OfferData }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [draft, setDraft] = useState<IntakeDraft>(emptyDraft);
  const [error, setError] = useState('');
  const [data, setData] = useState<OfferData>(initialData ?? disabledData);
  const [loaded, setLoaded] = useState(!!initialData);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [order, setOrder] = useState<ResumeWritingOrder | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const requestId = useRef('');
  const trigger = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) (reviewing ? reviewHeading.current : firstField.current)?.focus();
  }, [open, reviewing]);
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/resume-writing/orders', { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok || !body.config || !Array.isArray(body.orders)) throw new Error();
        if (!cancelled) { setData(body); setLoaded(true); }
      } catch { if (!cancelled) { setError('Could not load saved requests. Your local draft is still here.'); setLoaded(true); } }
    })();
    return () => { cancelled = true; };
  }, [open, loaded]);

  async function saveRequest() {
    if (busy || !consent || !data.config.intakeEnabled || !data.config.terms || order) return;
    requestId.current ||= crypto.randomUUID(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/resume-writing/orders', { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:requestId.current,intake:draft,consent:true,termsVersion:data.config.terms.version}) });
      const body = await response.json();
      if (!response.ok || !body.order) throw new Error(body.error || 'Could not confirm saving. Retry the same request before starting another.');
      setOrder(body.order); setData(current=>({...current,orders:[body.order,...current.orders.filter(o=>o.id!==body.order.id)]}));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not confirm saving. Your draft is still here.'); }
    finally { setBusy(false); }
  }
  async function prepareCheckout() {
    if (!order || busy || !data.config.checkoutEnabled || order.payment_status!=='unpaid') return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/resume-writing/orders/${order.id}/checkout`, {method:'POST'});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Checkout is unavailable. Your request is saved.');
      const url = new URL(body.url);
      const test=body.mode==='sandbox';
      if ((body.mode!=='sandbox'&&body.mode!=='live') || url.origin!=='https://buy.stripe.com' || url.username || url.password
        || !(test?/^\/test_[A-Za-z0-9]+$/:/^\/(?!test_)[A-Za-z0-9]+$/).test(url.pathname)
        || url.hash || url.searchParams.size!==1 || !/^[0-9a-f-]{36}$/i.test(url.searchParams.get('client_reference_id')??'')) throw new Error('Checkout is unavailable.');
      setCheckoutUrl(url.toString());
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Checkout is unavailable.'); }
    finally { setBusy(false); }
  }
  async function refreshStatus() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/resume-writing/orders', {cache:'no-store'}); const body = await response.json();
      if (!response.ok || !body.config || !Array.isArray(body.orders)) throw new Error();
      setData(body); setOrder(current=>current ? body.orders.find((o:ResumeWritingOrder)=>o.id===current.id) ?? current : null);
      setCheckoutUrl('');
    } catch { setError('Could not refresh payment status. A return from Stripe alone does not confirm payment.'); }
    finally { setBusy(false); }
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return <aside className={styles.purchase} aria-label="Optional résumé writing service">
    <h2>Want a hand with your first résumé?</h2>
    <p>Get a basic one-page résumé written from the details you provide.</p>
    <p className={styles.purchasePrice}>EC$50 · one-time</p>
    <ul className={styles.purchaseIncludes}>
      <li>First draft by the next day after payment and a complete questionnaire</li>
      <li>One revision</li>
      <li>Final PDF and an editable copy</li>
    </ul>
    <p>The builder and job applications remain free.</p>
    {data.config.paymentMode==='sandbox'&&<p role="status">Sandbox test checkout · no real payment. Use synthetic details only.</p>}
    <p id={`${id}-availability`} className={styles.purchaseNotice}>{data.config.checkoutEnabled ? 'Review the service terms and save your request before opening Stripe. Payment is confirmed by the server.' : 'Purchasing is not available yet. You can prepare a local draft; nothing is sent until you explicitly save a request.'}</p>
    <button ref={trigger} type="button" className={styles.secondary} aria-expanded={open} aria-controls={`${id}-intake`} aria-describedby={`${id}-availability`} onClick={() => setOpen(!open)}>Buy a résumé · EC$50</button>

    <div id={`${id}-intake`} className={styles.purchasePanel} hidden={!open}>
      {data.orders.length>0 && <div><h3>Your recent saved requests</h3>{data.orders.slice(0,10).map(saved=><button type="button" className={styles.secondary} key={saved.id} onClick={()=>{setOrder(saved);setDraft(saved.intake);setReviewing(true);setCheckoutUrl('');setError('');}}>{saved.intake.role} · {writingStatusLabels[saved.fulfillment_status]}</button>)}</div>}
      <form aria-label="Résumé writing intake" hidden={reviewing} onSubmit={event => {
        event.preventDefault();
        if (![draft.name, draft.email, draft.role].every(value => value.trim())) {
          setError('Add your name, delivery email, and target job before reviewing.');
          return;
        }
        setError('');
        setReviewing(true);
      }}>
        <h3>Your starting point</h3>
        <p>Share your own experience and skills. School projects, volunteering, and informal responsibilities are welcome. Paid work experience is not required.</p>
        <p id={`${id}-privacy`}>Unsaved details stay on this page and are lost if you reload or leave. Saving sends only this request to JobLink. Do not include ID numbers, payment details, or private information about other people.</p>
        <div className={styles.purchaseFields}>
          {intakeFields.map(field => <label key={field.key} className={styles.field}>
            <span>{field.label}{'required' in field && field.required ? ' *' : ''}</span>
            {'multiline' in field ? <textarea rows={3} maxLength={field.maxLength} value={draft[field.key]} aria-describedby={`${id}-privacy`} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} /> : <input ref={field.key === 'name' ? firstField : undefined} type={'type' in field ? field.type : 'text'} required={field.required} maxLength={field.maxLength} autoComplete="off" value={draft[field.key]} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} />}
          </label>)}
        </div>
        <div className={styles.purchaseActions}>
          <button type="submit" className={styles.primary}>Review your details</button>
          <button type="button" className={styles.secondary} onClick={close}>Keep using the free builder</button>
        </div>
      </form>

      <div hidden={!reviewing}>
        <h3 ref={reviewHeading} tabIndex={-1}>Review your résumé request</h3>
        <p>One-page résumé · one revision · PDF and editable copy</p>
        <dl className={styles.purchaseReview}>
          {intakeFields.map(field => <div key={field.key}><dt>{field.label.replace(' (optional)', '')}</dt><dd>{draft[field.key].trim() || 'Not added'}</dd></div>)}
        </dl>
        <p className={styles.purchasePrice}>Total: EC$50 · one-time</p>
        {(order?.terms ?? data.config.terms) ? <section aria-label="Service terms">{Object.entries(order?.terms ?? data.config.terms!).map(([key,value])=>key==='version'?null:<p key={key}><strong>{key[0].toUpperCase()+key.slice(1)}: </strong>{value}</p>)}</section> : <p>Delivery, revision, refund and privacy terms are awaiting confirmation. Checkout remains unavailable.</p>}
        {!order && <label className={styles.checkbox}><input type="checkbox" checked={consent} disabled={!data.config.intakeEnabled} onChange={e=>setConsent(e.target.checked)} /><span>I agree to these terms and to sharing this intake with JobLink for my résumé request.</span></label>}
        <p id={`${id}-payment`}>{order ? `Request saved · ${writingStatusLabels[order.fulfillment_status]}. Payment status: ${order.payment_status}.` : 'Your request has not been submitted and no payment has been made.'}</p>
        {order?.payment_review_required && <p>Payment needs review before work can continue.</p>}
        <div className={styles.purchaseActions}>
          {!order && <button type="button" className={styles.primary} disabled={busy||!consent||!data.config.intakeEnabled} onClick={()=>void saveRequest()}>Save request</button>}
          {checkoutUrl && order?.payment_status==='unpaid' && data.config.checkoutEnabled ? <a className={styles.primary} href={checkoutUrl} target="_blank" rel="noopener noreferrer">Pay EC$50 on Stripe (new tab)</a> : <button type="button" className={styles.primary} disabled={busy||!order||!data.config.checkoutEnabled||order.payment_status!=='unpaid'} aria-describedby={`${id}-payment`} onClick={()=>void prepareCheckout()}>Pay EC$50</button>}
          {!order && <button type="button" className={styles.secondary} onClick={() => {setReviewing(false);setConsent(false);}}>Edit your details</button>}
          {order && <button type="button" className={styles.secondary} disabled={busy} onClick={()=>void refreshStatus()}>Refresh saved status</button>}
          <button type="button" className={styles.secondary} onClick={close}>Keep using the free builder</button>
          {order && <button type="button" className={styles.secondary} onClick={()=>{setOrder(null);setDraft(emptyDraft);setConsent(false);setReviewing(false);setCheckoutUrl('');requestId.current='';}}>Start a new request</button>}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  </aside>;
}
