import Link from 'next/link'

/**
 * Shown to free employers where the candidate directory used to be, once the
 * directory is gated. Own applicants are unaffected and the link says so.
 */
export default function ProUpgradePrompt({ context = 'directory' }: { context?: 'directory' | 'profile' }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Employer Pro</p>
      <h2 className="mt-2 font-display text-xl font-bold text-text sm:text-2xl">
        {context === 'profile' ? 'This candidate profile is part of Employer Pro' : 'Find candidates before they apply'}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-light">
        With Employer Pro you can search job seekers who have chosen to be discoverable, open their profiles and invite them to apply to one of your live vacancies.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-text">
        <li className="flex gap-2"><span aria-hidden="true" className="text-primary">&#10003;</span> Search and invite discoverable candidates</li>
        <li className="flex gap-2"><span aria-hidden="true" className="text-primary">&#10003;</span> One Job Spotlight included each paid month (normally EC$125)</li>
        <li className="flex gap-2"><span aria-hidden="true" className="text-primary">&#10003;</span> EC$200 a month. Cancel any time; access runs to the end of the paid month.</li>
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/billing" className="inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white">See Employer Pro</Link>
        <Link href="/my-listings" className="text-sm font-semibold text-primary underline">Review your applicants</Link>
      </div>
      <p className="mt-4 text-xs text-text-muted">Posting jobs, receiving applications and contacting your own applicants stay free.</p>
    </section>
  )
}
