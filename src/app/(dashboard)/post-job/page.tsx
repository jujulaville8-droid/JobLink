'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BENEFITS, EMPTY_POSTING, postingErrors, STEPS, templateDescription, type PostingForm } from '@/lib/job-posting';
import { INDUSTRIES, JOB_TYPE_LABELS, SALARY_TYPE_PERIOD, type JobStatus } from '@/lib/types';

const inputClass = 'mt-2 block w-full rounded-xl border border-border bg-white px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30';
const buttonClass = 'rounded-xl bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-dark disabled:opacity-50';
// Floating-dock motion: the bar rises into place on mount, the buttons lift on hover and press in on tap.
const barSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;
const pressSpring = { type: 'spring', stiffness: 400, damping: 25 } as const;
const labelSwap = { duration: 0.15, ease: 'easeOut' } as const;
async function jsonRequest(url: string, body?: unknown) {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not save. Please try again.');
  return data;
}

export default function PostJobPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedId = params.get('edit') || params.get('draft');
  const [form, setForm] = useState<PostingForm>(EMPTY_POSTING);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [restored, setRestored] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [result, setResult] = useState<{ id: string; status: JobStatus } | null>(null);
  const [criteria, setCriteria] = useState<{ id: string; label: string }[]>([]);
  const [criteriaState, setCriteriaState] = useState('Loading screening criteria…');
  const id = useRef('');
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const stopped = useRef(false);
  const revision = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const still = useReducedMotion() === true;

  useEffect(() => {
    let cancelled = false;
    jsonRequest(`/api/employer/listings${requestedId ? `?id=${encodeURIComponent(requestedId)}` : ''}`).then(data => {
      if (cancelled) return;
      if (data.setup) { router.replace('/company-profile'); return; }
      const listing = data.listing;
      id.current = listing?.id || crypto.randomUUID();
      const isDraft = listing?.status === 'draft';
      setEditing(!!listing && !isDraft);
      setRestored(isDraft);
      if (isDraft) {
        setForm({ ...EMPTY_POSTING, ...listing.draft_data?.form });
        setStep(Math.max(0, Math.min(4, listing.draft_data?.step ?? 0)));
        setSaveState('Draft saved');
      } else if (listing) {
        setForm({ ...EMPTY_POSTING, ...Object.fromEntries(Object.keys(EMPTY_POSTING).filter(key => listing[key] != null).map(key => [key, listing[key]])),
          salary_min: listing.salary_min == null ? '' : String(listing.salary_min), salary_max: listing.salary_max == null ? '' : String(listing.salary_max),
          location_type: listing.draft_data?.location_type || 'On site' });
      } else setForm({ ...EMPTY_POSTING, category: data.company.industry || '', location: data.company.location || '' });
      setLoading(false);
    }).catch(() => { if (!cancelled) { setLoadError('We could not load your company and listing details. Check your connection and try again.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [requestedId, router, attempt]);

  const saveDraft = useCallback((snapshot: PostingForm, currentStep: number) => {
    setSaveState('Saving draft…');
    const draftId = id.current;
    const savedRevision = revision.current;
    const work = queue.current.catch(() => {}).then(() => jsonRequest('/api/employer/listings', { id: draftId, action: 'draft', form: snapshot, step: currentStep }));
    queue.current = work;
    work.then(() => { if (savedRevision === revision.current) setSaveState('Draft saved'); }, () => { if (savedRevision === revision.current) setSaveState('Draft could not be saved. Please retry.'); });
    return work;
  }, []);

  useEffect(() => {
    if (loading || editing || !dirty || result || busy) return;
    const timer = setTimeout(() => { if (!stopped.current) void saveDraft(form, step).catch(() => {}); }, 700);
    return () => clearTimeout(timer);
  }, [form, step, loading, editing, dirty, result, busy, saveDraft]);

  useEffect(() => {
    if (!dirty || editing || result || saveState === 'Draft saved') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, editing, result, saveState]);

  useEffect(() => {
    if (step !== 3 || loading) return;
    let cancelled = false;
    jsonRequest('/api/employer/screening-preview', form).then(data => {
      if (!cancelled) { setCriteria(data.criteria); setCriteriaState(data.criteria.length ? '' : 'Add clear responsibilities and requirements to your description to guide screening.'); }
    }).catch(() => { if (!cancelled) setCriteriaState('Screening preview is unavailable. Your description will still be used for screening after publication.'); });
    return () => { cancelled = true; };
  }, [step, loading, form]);

  function update<K extends keyof PostingForm>(key: K, value: PostingForm[K]) {
    revision.current += 1;
    setForm(previous => ({ ...previous, [key]: value }));
    setDirty(true);
    if (!editing) setSaveState('Unsaved changes');
    setErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
  }
  function jump(next: number) {
    revision.current += 1;
    setStep(next); setErrors({}); setDirty(true);
    if (!editing) setSaveState('Unsaved changes');
    if (next === 3) { setCriteria([]); setCriteriaState('Loading screening criteria…'); }
    requestAnimationFrame(() => heading.current?.focus());
  }
  function showErrors(found: Record<string, string>) {
    setErrors(found);
    requestAnimationFrame(() => document.getElementById(Object.keys(found)[0])?.focus());
  }
  async function next() {
    const found = postingErrors(form, step);
    if (Object.keys(found).length) { showErrors(found); return; }
    if (step === 1 && !form.description.trim()) {
      setDrafting(true);
      let description = templateDescription(form);
      try { description = (await jsonRequest('/api/employer/description', form)).description; } catch { /* Editable local fallback is always available. */ }
      update('description', description);
      setDrafting(false);
    }
    jump(step + 1);
  }
  async function submit() {
    const found = postingErrors(form);
    if (Object.keys(found).length) {
      const field = Object.keys(found)[0];
      setStep(field === 'description' ? 2 : field === 'category' ? 3 : field.startsWith('salary') ? 1 : 0);
      showErrors(found); return;
    }
    stopped.current = true; setBusy(true); setServerError('');
    try {
      await queue.current.catch(() => {});
      const data = await jsonRequest('/api/employer/listings', { id: id.current, action: editing ? 'edit' : 'submit', form, step });
      setResult(data.listing);
    } catch (error) { setServerError(error instanceof Error ? error.message : 'Please try again.'); stopped.current = false; }
    finally { setBusy(false); }
  }
  function field(key: 'title' | 'location' | 'salary_min' | 'salary_max', label: string) {
    return <div><label htmlFor={key} className="font-medium">{label}</label><input id={key} className={inputClass} value={form[key]} maxLength={key.startsWith('salary') ? 10 : 200} inputMode={key.startsWith('salary') ? 'numeric' : 'text'} onChange={event => update(key, event.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} />{errors[key] && <p id={`${key}-error`} className="mt-2 text-sm text-red-700">{errors[key]}</p>}</div>;
  }
  function chips<K extends 'location_type' | 'job_type' | 'salary_type'>(key: K, choices: Record<string, string>) {
    return <div className="flex flex-wrap gap-2">{Object.entries(choices).map(([value, label]) => <label key={value} className={`cursor-pointer rounded-full border px-4 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${form[key] === value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-light'}`}><input type="radio" className="sr-only" name={key} checked={form[key] === value} onChange={() => update(key, value as PostingForm[K])} />{label}</label>)}</div>;
  }
  if (loading) return <p role="status" className="py-20 text-center">Loading listing…</p>;
  if (loadError) return <div className="mx-auto max-w-2xl py-12"><p role="alert">{loadError}</p><button className={`${buttonClass} mt-6`} onClick={() => { setLoadError(''); setLoading(true); setAttempt(v => v + 1); }}>Try again</button></div>;
  if (result) return <div className="mx-auto max-w-2xl px-4 py-12"><p className="text-sm font-semibold text-primary">{result.status === 'pending_approval' ? 'Pending review' : 'Active'}</p><h1 className="mt-4 font-display text-4xl font-bold">{editing ? 'Listing updated' : 'Job submitted successfully'}</h1><p className="mt-5 text-text-light">{result.status === 'pending_approval' ? 'Your job is in review. Usually reviewed within one business day. You will get an email when it goes live.' : 'Your changes are saved and your listing is live.'}</p><section className="my-8 rounded-2xl border border-border bg-white p-6"><h2 className="font-display text-xl font-semibold">Job performance</h2><p className="mt-3 font-semibold">{form.title}</p><p className="text-text-light">{form.location} · {JOB_TYPE_LABELS[form.job_type]}</p><p className="mt-5 text-text-light">Your job performance will appear here.</p></section><Link href="/my-listings" className={buttonClass}>Go to my listings</Link></div>;

  const backDisabled = step === 0 || busy || drafting;
  const primaryDisabled = busy || drafting;
  const primaryLabel = drafting ? 'Preparing your draft…' : busy ? 'Saving…' : step === 4 ? editing ? 'Save Changes' : 'Submit Job Listing' : 'Continue';

  return <div className="mx-auto max-w-2xl px-4 pb-24 pt-8 sm:pb-28 sm:pt-12">
    <div className="mb-4 flex items-center justify-between gap-4 text-sm text-text-light"><p aria-live="polite">Step {step + 1} of 5</p>{!editing && <span role="status">{saveState || 'Progress saves automatically'}</span>}</div>
    <div className="mb-8 flex gap-2" aria-hidden="true">{STEPS.map((name, index) => <div key={name} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-border'}`} />)}</div>
    {restored && <p className="mb-5 rounded-xl bg-primary/5 p-4 text-sm text-primary">Draft restored. Continue where you left off.</p>}
    {saveState.includes('could not') && <button type="button" className="mb-4 text-primary underline" onClick={() => void saveDraft(form, step).catch(() => {})}>Retry draft save</button>}
    <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-bold tracking-tight text-text outline-none sm:text-4xl">{STEPS[step]}</h1>
    <p className="mb-8 mt-3 text-text-light">{['Start with the role and where the work happens.', 'Help candidates understand what you offer. Pay and benefits are optional.', 'We have started a draft for you. Make it your own.', 'Choose how you want to hire.', 'Check your job before sending it for review.'][step]}</p>
    {Object.keys(errors).length > 0 && <p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-red-700">{Object.values(errors).join('. ')}</p>}
    {serverError && <p role="alert" className="mb-6 text-red-700">{serverError}</p>}
    <form onSubmit={event => { event.preventDefault(); if (step === 4) void submit(); else void next(); }}>
      <fieldset disabled={busy || drafting} className="min-h-[340px] space-y-7">
        {step === 0 && <>{field('title', 'Job title *')}<fieldset><legend className="mb-3 font-medium">Location type</legend>{chips('location_type', { 'On site': 'On site', Hybrid: 'Hybrid', Remote: 'Remote' })}</fieldset>{field('location', 'Location (parish or town) *')}</>}
        {step === 1 && <><fieldset><legend className="mb-3 font-medium">Pay period</legend>{chips('salary_type', { hourly: 'Hourly', weekly: 'Weekly', biweekly: 'Bi-Weekly', monthly: 'Monthly', annually: 'Annually' })}</fieldset><div className="grid gap-5 sm:grid-cols-2">{field('salary_min', 'Minimum pay (XCD, optional)')}{field('salary_max', 'Maximum pay (XCD, optional)')}</div><label className="flex items-center gap-3"><input type="checkbox" checked={form.salary_visible} onChange={event => update('salary_visible', event.target.checked)} />Show salary on listing</label><fieldset><legend className="mb-3 font-medium">Benefits (optional)</legend><div className="flex flex-wrap gap-2">{BENEFITS.map(benefit => <button type="button" key={benefit} aria-pressed={form.benefits.includes(benefit)} onClick={() => update('benefits', form.benefits.includes(benefit) ? form.benefits.filter(v => v !== benefit) : [...form.benefits, benefit])} className={`rounded-full border px-4 py-2 ${form.benefits.includes(benefit) ? 'border-primary bg-primary/5 text-primary' : 'border-border'}`}>{form.benefits.includes(benefit) ? '✓ ' : '+ '}{benefit}</button>)}</div></fieldset></>}
        {step === 2 && <div><label htmlFor="description" className="font-medium">Job description *</label><textarea id="description" rows={16} maxLength={6000} className={inputClass} value={form.description} onChange={event => update('description', event.target.value)} aria-invalid={!!errors.description} aria-describedby="description-note description-error" /><p id="description-note" className="mt-3 text-sm text-text-light">You are responsible for the accuracy of this description. Review any suggested details before submitting.</p>{errors.description && <p id="description-error" className="text-sm text-red-700">{errors.description}</p>}<p className="mt-2 text-xs text-text-muted">{form.description.length} / 6000</p>{form.description.length > 0 && form.description.length < 200 && <p className="mt-2 text-sm text-text-light">A short description gets fewer good applicants. Add the main duties, requirements and hours.</p>}</div>}
        {step === 3 && <><fieldset><legend className="mb-3 font-medium">Job type</legend>{chips('job_type', JOB_TYPE_LABELS)}</fieldset><div><label htmlFor="category" className="font-medium">Category *</label><select id="category" value={form.category} onChange={event => update('category', event.target.value)} className={inputClass} aria-invalid={!!errors.category} aria-describedby={errors.category ? 'category-error' : undefined}><option value="">Select category</option>{form.category && !INDUSTRIES.includes(form.category) && <option>{form.category}</option>}{INDUSTRIES.map(value => <option key={value}>{value}</option>)}</select>{errors.category && <p id="category-error" className="text-red-700">{errors.category}</p>}</div><section className="rounded-xl border border-border p-5"><h2 className="font-display text-xl font-semibold">Screening questions and criteria</h2><p className="mt-2 text-sm text-text-light">JobLink screens applications against the responsibilities and requirements in your description. These are the criteria it can use after your job is published.</p>{criteriaState && <p role="status" className="mt-3 text-sm">{criteriaState}</p>}{criteria.length > 0 && <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">{criteria.map(item => <li key={item.id}>{item.label}</li>)}</ul>}<button type="button" className="mt-4 text-sm font-semibold text-primary underline" onClick={() => jump(2)}>Edit screening requirements in description</button></section><p className="text-sm text-text-light">Jobs stay active until you close them. No expiry date.</p></>}
        {step === 4 && <div className="space-y-5">{STEPS.slice(0, 4).map((name, index) => <section key={name} className="rounded-xl border border-border bg-white p-5"><div className="mb-3 flex justify-between gap-3"><h2 className="font-display text-lg font-semibold">{name}</h2><button type="button" className="font-semibold text-primary underline" aria-label={`Edit ${name}`} onClick={() => jump(index)}>Edit</button></div>{index === 0 && <><p className="font-semibold">{form.title}</p><p>{form.location_type} · {form.location}</p></>}{index === 1 && <><p>{form.salary_min || form.salary_max ? `EC$${form.salary_min || '—'} to EC$${form.salary_max || '—'} ${SALARY_TYPE_PERIOD[form.salary_type]}` : 'Add optional pay information'}</p><p className="mt-1 text-sm text-text-light">{form.salary_visible ? 'Salary shown on listing' : 'Salary hidden on listing'}</p><p className="mt-3">{form.benefits.join(', ') || 'Add optional benefits'}</p></>}{index === 2 && <p className="whitespace-pre-wrap text-sm leading-relaxed">{form.description}</p>}{index === 3 && <><p>{JOB_TYPE_LABELS[form.job_type]} · {form.category}</p><p className="mt-2 text-sm text-text-light">Screening uses the requirements in your description. Stays active until you close it.</p></>}</section>)}</div>}
      </fieldset>
      <motion.div initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={still ? { duration: 0.2 } : barSpring} className="sticky bottom-4 mt-10 flex items-center justify-between gap-3 rounded-2xl border border-border bg-white px-3 py-5 shadow-lg shadow-primary/10 sm:px-5">
        <motion.button type="button" disabled={backDisabled} onClick={() => jump(step - 1)} whileHover={still || backDisabled ? undefined : { y: -2 }} whileTap={still || backDisabled ? undefined : { scale: 0.98 }} transition={pressSpring} className="rounded-xl border border-border px-5 py-3 font-semibold disabled:opacity-40 sm:px-6">Back</motion.button>
        <motion.button type="submit" disabled={primaryDisabled} aria-label={primaryLabel} whileHover={still || primaryDisabled ? undefined : { y: -2 }} whileTap={still || primaryDisabled ? undefined : { scale: 0.98 }} transition={pressSpring} className={`${buttonClass} max-sm:px-4`}>
          {/* Both crossfading labels are absolutely positioned, so this invisible copy of the current
              label is what gives the button its size. */}
          <span aria-hidden="true" className="relative inline-flex items-center justify-center">
            <span className="invisible">{primaryLabel}</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={primaryLabel} className="absolute inset-0 inline-flex items-center justify-center" initial={still ? { opacity: 0 } : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={still ? { opacity: 0 } : { opacity: 0, y: -6 }} transition={labelSwap}>{primaryLabel}</motion.span>
            </AnimatePresence>
          </span>
        </motion.button>
      </motion.div>
    </form>
  </div>;
}
