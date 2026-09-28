'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'

const input = 'mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20'

export default function EmployerEnquiryForm() {
  const requestId = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  if (done) return <div role="status" className="rounded-2xl border border-teal-200 bg-teal-50 p-8">
    <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-teal-800">Request received</p>
    <h2 className="font-display text-3xl text-slate-900">You’ve taken the first step.</h2>
    <p className="mt-4 text-slate-700">We’ve saved your vacancy request. Julian at JobLinks will review it and contact you using the details you provided to confirm the role and whether the pilot is a fit.</p>
    <p className="mt-4 text-slate-700">Your vacancy is not published yet. We’ll agree the wording and next steps with you first.</p>
    <div className="mt-6 rounded-xl border border-teal-200 bg-white p-5">
      <h3 className="text-xl font-semibold text-slate-900">Get ready to manage your hiring</h3>
      <p className="mt-2 text-slate-700">Create a free employer account so you can manage job listings and review applicants. Use the same email address you gave us so we can help connect your vacancy to your account.</p>
      <Link href="/signup?role=employer" className="mt-4 inline-flex rounded-xl bg-teal-800 px-5 py-3 font-semibold text-white transition hover:bg-teal-900">Create your employer account</Link>
      <p className="mt-3 text-sm text-slate-600">This is optional. Your request is already saved, and we’ll still contact you if you don’t sign up now.</p>
      <p className="mt-3 text-sm text-slate-600">Already have an employer account? <Link href="/employer/login" className="font-semibold text-teal-800 underline">Sign in</Link></p>
    </div>
    <p className="mt-4 text-sm text-slate-600">Reference: {reference}. Need to add something? You can send another request and include this reference so we can keep the details together.</p>
  </div>
  return <form className="space-y-5" onSubmit={async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const fields = new FormData(event.currentTarget)
    requestId.current ??= crypto.randomUUID()
    const source = new URLSearchParams(window.location.search).get('source')
    try {
      const res = await fetch('/api/employer-enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        id: requestId.current, company_name: fields.get('company_name'), contact_name: fields.get('contact_name'), email: String(fields.get('email')).trim(),
        phone: fields.get('phone'), job_title: fields.get('job_title'), details: fields.get('details'), website: fields.get('website'), contact_consent: fields.get('consent') === 'on',
        source: source && /^[a-zA-Z0-9_-]{1,80}$/.test(source) ? source : 'website',
      }) })
      const body = await res.json()
      if (!res.ok) setError(body.error || 'Could not save your request. Please try again.')
      else { setReference(requestId.current.slice(0, 8).toUpperCase()); setDone(true) }
    } catch { setError('Connection problem. Your details are still here—please try again.') }
    finally { setBusy(false) }
  }}>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="font-medium">Business name<input className={input} name="company_name" autoComplete="organization" minLength={2} maxLength={150} required /></label>
      <label className="font-medium">Your name<input className={input} name="contact_name" autoComplete="name" minLength={2} maxLength={100} required /></label>
      <label className="font-medium">Email address<input className={input} name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <label className="font-medium">Phone / WhatsApp <span className="font-normal text-slate-500">(optional)</span><input className={input} name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
    </div>
    <label className="block font-medium">Who are you hiring?<input className={input} name="job_title" placeholder="For example, a part-time cook" minLength={2} maxLength={150} required /></label>
    <label className="block font-medium">Paste your advert, or tell us about the role<textarea className={`${input} min-h-40`} name="details" minLength={20} maxLength={6000} required placeholder="Include the location, duties, hours, pay range and when you need someone, if you know them. You can paste a link to an existing advert too." /><span className="mt-2 block text-sm font-normal text-slate-500">No polished job description needed. Please don’t include applicants’ personal details.</span></label>
    <div className="absolute -left-[10000px]" aria-hidden="true"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="flex items-start gap-3 text-sm leading-6"><input name="consent" type="checkbox" required className="mt-1.5 h-4 w-4 shrink-0 accent-teal-700" /><span>I’m authorised to enquire for this business, and JobLinks may contact me about this vacancy using the details above. I understand this doesn’t publish a job or subscribe me to marketing. <Link className="underline" href="/privacy">Privacy policy</Link></span></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <button className="w-full rounded-xl bg-teal-800 px-6 py-4 font-semibold text-white transition hover:bg-teal-900 disabled:opacity-50" disabled={busy}>{busy ? 'Sending your request…' : 'Send us your vacancy'}</button>
    <p className="text-center text-sm text-slate-500">Free first-vacancy pilot. No account or payment details needed.</p>
  </form>
}
