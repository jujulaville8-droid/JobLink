"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Mail, Plus, Pencil, Trash2, Check, Search, SlidersHorizontal } from 'lucide-react';
import { INDUSTRIES, JOB_TYPE_LABELS, type JobType } from '@/lib/types';
import { alertCriteriaSchema, type JobAlert } from '@/lib/job-alert-criteria';
import styles from './alerts.module.css';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState('');
  const [industry, setIndustry] = useState('');
  const [jobType, setJobType] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/alerts', { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) { setErrorCode(data.code || ''); throw new Error(data.error || 'Unable to load alerts. Try again.'); }
      setAlerts(data.alerts); setEmail(data.email || ''); setReady(true);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'Unable to load alerts. Check your connection and try again.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // load only updates state after the asynchronous request completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => { if (showForm) inputRef.current?.focus(); }, [showForm, editingId]);

  function openForm(alert?: JobAlert) {
    setEditingId(alert?.id || null); setKeywords(alert?.keywords?.join(', ') || '');
    setIndustry(alert?.industry || ''); setJobType(alert?.job_type || '');
    setFormError(''); setNotice(''); setConfirmDelete(null); setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFormError(''); setNotice('');
    const parsed = alertCriteriaSchema.safeParse({ keywords: keywords.split(','), industry, job_type: jobType });
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message || 'Check your criteria.'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/alerts', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...parsed.data, ...(editingId ? { id: editingId } : {}) }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save. Try again.');
      setAlerts(current => editingId ? current.map(alert => alert.id === editingId ? data.alert : alert) : [data.alert, ...current]);
      setShowForm(false); setNotice(editingId ? 'Alert updated.' : 'Alert saved. We’ll email you when a new job matches.');
    } catch (err) { setFormError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'Unable to save. Check your connection and try again.'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (deleting) return;
    setDeleting(id); setError(''); setNotice('');
    try {
      const response = await fetch('/api/alerts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to delete. Try again.');
      setAlerts(current => current.filter(alert => alert.id !== id)); setConfirmDelete(null);
      if (editingId === id) setShowForm(false);
      setNotice('Alert deleted. You won’t receive new emails for these criteria.');
    } catch { setError('Unable to delete this alert. Check your connection and try again.'); }
    finally { setDeleting(null); }
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><div className={styles.heading}><Bell aria-hidden="true" size={27} /><h1>Job alerts</h1></div><p>Your next opportunity, straight to your inbox.</p></div>
      <button className={styles.primary} onClick={() => openForm()} disabled={!ready || saving || !!deleting}><Plus size={18} aria-hidden="true" />New alert</button>
    </header>

    {email && <div className={styles.delivery}><Mail size={22} aria-hidden="true" /><div><span>Delivery address</span><strong>{email}</strong></div><span className={styles.emailTag}>Email alerts</span></div>}
    {notice && <p className={styles.success} role="status"><Check size={18} aria-hidden="true" />{notice}</p>}
    {error && <div className={styles.error} role="alert"><p>{error}</p>{errorCode === 'profile_required' ? <Link href="/profile">Set up your seeker profile</Link> : errorCode === 'verify_email' ? <Link href="/verify-email">Verify email</Link> : errorCode === 'sign_in' ? <Link href="/login?next=/alerts">Sign in</Link> : !ready && <button onClick={() => { setLoading(true); setError(''); setErrorCode(''); void load(); }}>Try again</button>}</div>}

    <div className={styles.layout}>
      <section className={styles.saved} aria-labelledby="saved-alerts-heading">
        <div className={styles.sectionTitle}><h2 id="saved-alerts-heading">Your saved alerts</h2>{ready && <span>{alerts.length}</span>}</div>
        {loading ? <p role="status" className={styles.empty}>Loading your alerts…</p> : ready && !alerts.length ? <div className={styles.empty}><div className={styles.emptyIcon}><Search size={30} aria-hidden="true" /></div><h3>Tell us what you’re looking for</h3><p>Choose a role, an industry, or a job type. We’ll keep an eye out for new matches in Antigua and Barbuda.</p><button className={styles.secondary} onClick={() => openForm()}>Create your first alert</button></div> : alerts.map(alert => <article key={alert.id} className={styles.card}>
          <div className={styles.cardHeading}><h3>{alert.keywords?.length ? alert.keywords.join(' or ') : alert.industry || `${JOB_TYPE_LABELS[alert.job_type as JobType] || 'New'} opportunities`}</h3><span className={styles.active}><span />Active</span></div>
          <div className={styles.tags}><span>{alert.industry || 'Any industry'}</span><span>{JOB_TYPE_LABELS[alert.job_type as JobType] || 'Any job type'}</span></div>
          <p className={styles.matchNote}>{alert.keywords?.length ? 'Matches any of these keywords in the job title or description.' : 'Matches new jobs with these filters.'}</p>
          <div className={styles.cardFooter}><span>Created {new Date(alert.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span><div className={styles.actions}><button onClick={() => openForm(alert)} aria-label={`Edit alert: ${alert.keywords?.join(', ') || alert.industry || 'job type'}`} disabled={saving || !!deleting}><Pencil size={16} aria-hidden="true" />Edit</button><button onClick={() => { setConfirmDelete(alert.id); setError(''); }} aria-label={`Delete alert: ${alert.keywords?.join(', ') || alert.industry || 'job type'}`} disabled={saving || !!deleting}><Trash2 size={16} aria-hidden="true" />Delete</button></div></div>
          {confirmDelete === alert.id && <div className={styles.confirm}><p>Delete this alert? Emails for these criteria will stop.</p><div className={styles.actions}><button className={styles.danger} onClick={() => void remove(alert.id)} disabled={!!deleting}>{deleting === alert.id ? 'Deleting…' : 'Confirm delete'}</button><button onClick={() => setConfirmDelete(null)} disabled={!!deleting}>Keep alert</button></div></div>}
        </article>)}
      </section>

      <aside className={styles.sidebar}>
        {showForm ? <form className={styles.form} onSubmit={save} aria-label={editingId ? 'Edit alert' : 'New alert'}>
          <div className={styles.formTitle}><SlidersHorizontal size={20} aria-hidden="true" /><h2>{editingId ? 'Edit your alert' : 'What should we look for?'}</h2></div>
          <p>Use one filter or combine a few to narrow your matches.</p>
          <label htmlFor="alert-keywords">Keywords</label><input ref={inputRef} id="alert-keywords" value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="e.g. receptionist, front desk" aria-describedby="keywords-help" maxLength={809} disabled={saving} />
          <small id="keywords-help">Separate keywords with commas. We’ll match any one of them. Up to 10 keywords.</small>
          <label htmlFor="alert-industry">Industry</label><select id="alert-industry" value={industry} onChange={event => setIndustry(event.target.value)} disabled={saving}><option value="">Any industry</option>{INDUSTRIES.map(value => <option key={value}>{value}</option>)}</select>
          <label htmlFor="alert-job-type">Job type</label><select id="alert-job-type" value={jobType} onChange={event => setJobType(event.target.value)} disabled={saving}><option value="">Any job type</option>{Object.entries(JOB_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <p className={styles.rule}>If you choose an industry or job type, the job must match those too.</p>
          {formError && <p role="alert" className={styles.error}>{formError}</p>}
          <button type="submit" className={styles.primary} disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Save alert'}</button><button type="button" className={styles.cancel} onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
        </form> : <div className={styles.guide}><Mail size={26} aria-hidden="true" /><h2>Less searching.<br />More possibilities.</h2><p>When a newly published job matches a saved alert, we’ll email you a link to view it and apply.</p><p>Already-listed jobs won’t trigger a new alert. You can edit or delete your alerts here anytime.</p><Link href="/jobs">Browse jobs available now</Link></div>}
      </aside>
    </div>
  </div>;
}
