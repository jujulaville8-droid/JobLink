import Link from 'next/link'
import { verificationEnabled } from '@/lib/verification/server'

export const dynamic = 'force-dynamic'

const TITLE = 'How to get your police record in Antigua'
const DESCRIPTION = 'A short guide to getting a police record (police certificate of character) from the Criminal Records Office in St John’s, Antigua, for a job application.'
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://joblinkantigua.com/guides/police-record' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: 'https://joblinkantigua.com/guides/police-record', siteName: 'JobLink' },
}

/*
 * CONTENT TO CONFIRM BEFORE LAUNCH (launch plan, next steps): the current fee,
 * opening hours, what to bring and how long it takes must be confirmed with
 * the Criminal Records Office. Until then this page tells people to check with
 * the office rather than stating figures we have not verified.
 */
export default function PoliceRecordGuidePage() {
  const verified = verificationEnabled()
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm font-semibold text-primary">JobLink guide</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-text md:text-4xl">How to get your police record in Antigua</h1>
        <p className="mt-4 text-lg text-text-light">Many employers ask for a police record before they hire, especially for security, hospitality, childcare, domestic work and jobs that handle cash. Here is how to get one.</p>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-bold text-primary">The steps</h2>
          <ol className="mt-5 space-y-5">
            {[
              ['Go to the Criminal Records Office in St John’s', 'Police records are issued by the Criminal Records Office of the Royal Police Force of Antigua and Barbuda. Call ahead or ask at Police Headquarters for the current opening hours.'],
              ['Bring your identification', 'Take a valid photo ID, such as your passport or national ID card. Ask the office what else they need from you, for example passport photos or a letter, before you make the trip.'],
              ['Fill in the application and pay the fee', 'You will complete an application form and pay a fee. Ask the office for the current fee and how to pay it.'],
              ['Collect your police record', 'The office will tell you when to come back for it. Check that your name is spelled exactly as it is on your ID.'],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{index + 1}</span>
                <div><p className="font-semibold text-text">{title}</p><p className="mt-1 text-text-light">{body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-2xl font-bold text-primary">Good to know</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-text-light">
            <li>Employers usually want a recent police record, so get it close to when you plan to apply.</li>
            <li>Keep the original safe and flat. Take a clear photo or scan of the whole page, with all four corners showing.</li>
            <li>Under the law in Antigua and Barbuda, some older convictions become &ldquo;spent&rdquo; after a number of years, and you don&apos;t have to disclose them.</li>
          </ul>
        </section>

        {verified ? (
          <section className="mt-10 rounded-2xl bg-primary/5 p-6">
            <h2 className="font-display text-xl font-bold text-text">Use one police record for 6 months of applications</h2>
            <p className="mt-2 text-text-light">With JobLink Verified, your police record and right to work are checked once. Then you can send both to any employer in one click for 6 months, instead of getting a fresh copy each time one asks. EC$40 verification fee. Optional.</p>
            <Link href="/verified" className="mt-4 inline-flex rounded-lg bg-primary px-5 py-3 font-semibold text-white">See how Verified works</Link>
            <p className="mt-3 text-sm text-text-muted">Applying on JobLink is always free.</p>
          </section>
        ) : (
          <section className="mt-10 rounded-2xl bg-primary/5 p-6">
            <p className="text-text-light">Ready to apply? <Link href="/jobs" className="font-semibold text-primary underline">Browse jobs on JobLink</Link>. Applying is always free.</p>
          </section>
        )}
      </div>
    </div>
  )
}
