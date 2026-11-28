'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EmployerBillingSummary } from '@/lib/employer-billing/summary'

const card = 'rounded-2xl border border-border bg-white p-5 sm:p-6'
const primary = 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'
const quiet = 'inline-flex items-center justify-center rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-text disabled:opacity-50'
const input = 'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text'

const longDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Antigua' })
  .format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso))
const todayInAntigua = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Antigua' }).format(new Date())

async function post(path: string, body: unknown = {}) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again.')
  return data
}

const STATUS: Record<string, string> = {
  requested: 'Booked: JobLink will confirm the details and dates with you',
  scheduled: 'Scheduled: artwork approved, going live soon',
  live: 'Live',
  ended: 'Ended',
}

export default function EmployerBillingPanel({ summary, focusJobId, justPaid }: { summary: EmployerBillingSummary; focusJobId: string | null; justPaid: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(justPaid ? 'Thank you, your payment was received. It can take a minute to appear here.' : '')
  const openJobs = summary.jobs.filter((job) => !job.booked)
  const [jobId, setJobId] = useState(openJobs.some((job) => job.id === focusJobId) ? focusJobId! : openJobs[0]?.id ?? '')
  const [start, setStart] = useState(todayInAntigua())
  const credit = summary.credits[0] ?? null

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name); setError('')
    try { await action() } catch (problem) { setError(problem instanceof Error ? problem.message : 'Something went wrong.') }
    setBusy('')
  }
  const buy = (offer: 'spotlight' | 'pro') => run(offer, async () => {
    const { url } = await post('/api/employer/billing/start', { offer, job_id: offer === 'spotlight' && jobId ? jobId : null })
    window.location.href = url
  })
  const book = () => run('book', async () => {
    await post('/api/employer/billing/redeem', { credit_id: credit!.id, job_id: jobId, requested_start: start })
    setNotice('Spotlight booked. JobLink will confirm the vacancy, artwork and start date with you by email.')
    router.refresh()
  })

  const { pro } = summary
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-text">Billing and Spotlight</h1>
        <p className="mt-1 text-sm text-text-light">Posting jobs, receiving applications and contacting your applicants are free. Spotlight and Employer Pro are optional.</p>
      </header>
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

      {summary.claimable.length > 0 && (
        <section className={card}>
          <h2 className="font-display text-lg font-semibold text-text">A payment that looks like yours</h2>
          <p className="mt-1 text-sm text-text-light">These were paid with your email address through a shared link. Add them to your company.</p>
          <ul className="mt-3 divide-y divide-border">
            {summary.claimable.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>{order.offer === 'pro' ? 'Employer Pro' : 'Job Spotlight'}{order.paid_at ? ` · paid ${longDate(order.paid_at)}` : ''}</span>
                <button className={quiet} disabled={!!busy} onClick={() => run(`claim-${order.id}`, async () => { await post('/api/employer/billing/claim', { order_id: order.id }); router.refresh() })}>
                  {busy === `claim-${order.id}` ? 'Adding…' : 'Add to my company'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Job Spotlight · EC$125 once</p>
        <h2 className="mt-1 font-display text-lg font-semibold text-text">Feature a vacancy for seven days</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-light">Your vacancy is featured on JobLink for seven days, with one post on our Facebook page and one on Instagram. We email you screenshots and links once each is published, and the results at the end.</p>

        {summary.jobs.length === 0 ? (
          <p className="mt-4 text-sm text-text-light">You have no live vacancies yet. <Link href="/post-job" className="font-semibold text-primary underline">Post a job</Link> first; posting is free.</p>
        ) : openJobs.length === 0 ? (
          <p className="mt-4 text-sm text-text-light">All of your live vacancies already have a Spotlight booked or running.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-text">Vacancy
              <select className={input} value={jobId} onChange={(event) => setJobId(event.target.value)}>
                {openJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
              </select>
            </label>
            {credit && (
              <label className="text-sm font-medium text-text">Preferred start date
                <input type="date" className={input} value={start} min={todayInAntigua()} onChange={(event) => setStart(event.target.value)} />
              </label>
            )}
          </div>
        )}

        {openJobs.length > 0 && (
          credit ? (
            <div className="mt-4">
              <p className="text-sm text-text">
                You have <strong>{summary.credits.length}</strong> Spotlight{summary.credits.length === 1 ? '' : 's'} to use
                {credit.expires_at ? `. The next one expires on ${longDate(credit.expires_at)} (end of its paid month; it does not roll over).` : '.'}
              </p>
              <button className={`${primary} mt-3`} disabled={!!busy || !jobId} onClick={book}>{busy === 'book' ? 'Booking…' : 'Use a Spotlight on this vacancy'}</button>
              <p className="mt-2 text-xs text-text-muted">The seven days start when the website placement goes live. We confirm the role, artwork, pay and shift details with you first.</p>
            </div>
          ) : summary.salesOpen ? (
            <div className="mt-4">
              <button className={primary} disabled={!!busy || !jobId} onClick={() => buy('spotlight')}>{busy === 'spotlight' ? 'Opening payment…' : 'Buy a Spotlight, EC$125'}</button>
              <p className="mt-2 text-xs text-text-muted">Secure card payment by Stripe. After payment, JobLink confirms the details and start date with you before anything is published.</p>
            </div>
          ) : <p className="mt-4 text-sm text-text-muted">Spotlight purchases are paused at the moment.</p>
        )}

        {summary.campaigns.length > 0 && (
          <ul className="mt-5 divide-y divide-border border-t border-border">
            {summary.campaigns.map((campaign) => (
              <li key={campaign.id} className="py-3 text-sm">
                <p className="font-medium text-text">{campaign.job_title}</p>
                <p className="text-text-light">
                  {campaign.status === 'live' && campaign.ends_at ? `Live until ${longDate(campaign.ends_at)}`
                    : campaign.status === 'ended' ? `Ended${campaign.ended_reason === 'job_closed' ? ' when the vacancy closed' : ''}${campaign.ends_at ? ` · ${longDate(campaign.ends_at)}` : ''}`
                    : `${STATUS[campaign.status]} · preferred start ${longDate(campaign.requested_start)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Employer Pro · EC$200 a month</p>
        <h2 className="mt-1 font-display text-lg font-semibold text-text">{pro.active ? 'You have Employer Pro' : 'Find candidates before they apply'}</h2>
        {pro.active ? (
          <div className="mt-2 space-y-2 text-sm text-text-light">
            {pro.source === 'grant' ? <p>Your Pro access was set up by JobLink.</p>
              : pro.paidThrough && <p>{pro.cancelAtPeriodEnd ? 'Cancelled. Your access continues until' : 'Paid through'} <strong className="text-text">{longDate(pro.paidThrough)}</strong>{pro.cancelAtPeriodEnd ? '.' : '. It renews automatically each month.'}</p>}
            {pro.status === 'past_due' && <p className="font-medium text-amber-800">Your last renewal did not go through. Update your card to keep Pro.</p>}
            <p>Includes searching and inviting discoverable candidates, and one Spotlight each paid month.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/browse-candidates" className={quiet}>Browse candidates</Link>
              {pro.manageable && (
                <button className={quiet} disabled={!!busy} onClick={() => run('portal', async () => { const { url } = await post('/api/employer/billing/portal'); window.location.href = url })}>
                  {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <ul className="space-y-1.5 text-sm text-text">
              <li>Search job seekers who chose to be discoverable, and invite them to apply to your live vacancies</li>
              <li>One Job Spotlight included each paid month (normally EC$125)</li>
              <li>Cancel any time; access runs to the end of the month you paid for</li>
            </ul>
            {summary.salesOpen
              ? <button className={`${primary} mt-4`} disabled={!!busy} onClick={() => buy('pro')}>{busy === 'pro' ? 'Opening payment…' : 'Start Employer Pro, EC$200 a month'}</button>
              : <p className="mt-4 text-sm text-text-muted">Employer Pro sign-ups are paused at the moment.</p>}
          </div>
        )}
      </section>
      <p className="text-xs text-text-muted">Questions about a payment? Email support@joblinkantigua.com. Prices are in Eastern Caribbean dollars.</p>
    </div>
  )
}
