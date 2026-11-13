import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verificationEnabled } from '@/lib/verification/server'
import { RTW_GROUPS } from '@/lib/verification/shared'

export const dynamic = 'force-dynamic'

const TITLE = 'JobLink Verified: police record and right to work, checked once'
const DESCRIPTION = 'Get your police record and right to work checked once, then send both to any employer in one click for 6 months. EC$40 verification fee. Applying on JobLink is always free.'
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://joblinkantigua.com/verified' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: 'https://joblinkantigua.com/verified', siteName: 'JobLink' },
}

const FAQ = [
  ['Is JobLink charging to apply now?', 'No. Applying on JobLink is free and always will be. Browsing jobs, the resume builder, job alerts and messaging stay free too. Verified is an optional extra.'],
  ['What does "verified" mean?', 'That your police record is genuine, was issued in the last 30 days and belongs to you, and that your right to work in Antigua and Barbuda is confirmed. JobLink never judges what the record says.'],
  ['Will being verified get me the job?', 'We can’t promise that, and we never guarantee interviews or jobs. Employers we spoke to told us they prefer applicants who already have their police record ready.'],
  ['Are verified applicants shown first?', 'No. The order employers see does not change. They can filter for verified applicants if they choose.'],
  ['What if you can’t verify me?', 'You get a full refund if the name doesn’t match, a document isn’t genuine or is too old, or you aren’t eligible to work here. Your files are deleted and employers are told nothing. If a photo is just hard to read, you can upload it again for free.'],
  ['How long does it last?', '6 months from the date on your police record. For work permit holders it ends sooner if the permit expires first. We remind you 2 weeks before. Renewing is a new EC$40 check with a new police record. There is no subscription and nothing renews by itself.'],
  ['Can I change my mind?', 'Yes. You can stop sharing with any employer, delete your documents (the badge ends), or delete your account to remove everything we hold.'],
  ['I don’t have a bank card. Can I still pay?', 'Right now payment is by card. We are working on a second way to pay.'],
] as const

export default function VerifiedPage() {
  if (!verificationEnabled()) notFound()
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-br from-primary-dark to-primary py-14 text-white md:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <p className="inline-block rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">Applying is always free. Verified is optional.</p>
          <h1 className="mt-4 font-display text-3xl font-bold md:text-5xl">Get verified once. Send your police record and right to work to any employer in one click.</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">Police record and right to work, sorted before you apply. EC$40 for 6 months.</p>
          <Link href="/verification" className="mt-7 inline-flex rounded-lg bg-white px-5 py-3 font-semibold text-primary">Get verified, EC$40</Link>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-14 px-4 py-14">
        <section>
          <h2 className="font-display text-2xl font-bold text-primary">How it works</h2>
          <ol className="mt-5 space-y-4">
            {[
              ['Pay the EC$40 verification fee', 'It covers checking your documents and storing your police record securely for 6 months. If we can’t verify you, we refund you in full.'],
              ['Upload two documents', 'A right-to-work document, such as your passport or national ID, and a police record issued in the last 30 days.'],
              ['We check them within 48 hours', 'A JobLink reviewer checks they are genuine, recent and yours. An unreadable photo can be uploaded again for free.'],
              ['Apply with your documents ticked', 'For 6 months, send your verified police record and proof you can work locally with any application. You choose each time.'],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{index + 1}</span>
                <div><p className="font-semibold text-text">{title}</p><p className="mt-1 text-text-light">{body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-primary">What you get</h2>
          <ul className="mt-5 space-y-3 text-text-light">
            <li><strong className="text-text">One police record covers 6 months of applications.</strong> No fresh copy and trip to the Criminal Records Office in St John&apos;s each time an employer asks.</li>
            <li><strong className="text-text">Ready when asked.</strong> If an employer wants a police record, it is already attached.</li>
            <li><strong className="text-text">Seen straight away.</strong> The badge shows on every application, and employers can filter for verified applicants.</li>
            <li><strong className="text-text">Proof you can work locally,</strong> without handing your passport or ID to people you don&apos;t know.</li>
            <li><strong className="text-text">You stay in control.</strong> You choose which employers get your documents, see who opened them, and can stop sharing at any time.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-primary">What an employer receives</h2>
          <p className="mt-3 text-text-light">Only when you tick the box on an application:</p>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-text-light">
            <li>Your police record, stamped &ldquo;Verified by JobLink&rdquo; with the date and the employer&apos;s name.</li>
            <li>A right-to-work confirmation written by JobLink: your name, status, the type of document checked, the date and a verification code. It never shows ID numbers or photos.</li>
          </ol>
          <p className="mt-4 text-text-light">You can preview exactly what they will see before you share anything.</p>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-primary">Who can be verified</h2>
          <p className="mt-3 text-text-light">Anyone who can legally work in Antigua and Barbuda. The badge says whether you need a work permit.</p>
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="bg-bg-alt text-text"><tr><th className="p-3 font-semibold">You are</th><th className="p-3 font-semibold">Proof we accept</th></tr></thead>
              <tbody className="divide-y divide-border text-text-light">
                {Object.entries(RTW_GROUPS).map(([key, group]) => (
                  <tr key={key}><td className="p-3 align-top"><span className="font-medium text-text">{group.label}</span>{group.hint && <span className="block text-xs">{group.hint}</span>}</td><td className="p-3 align-top">{group.proof}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-text-muted">Digital nomad visa holders and visitors are not eligible for local jobs, so can&apos;t be verified.</p>
        </section>

        <section className="rounded-2xl border border-border bg-bg-alt p-6">
          <h2 className="font-display text-2xl font-bold text-primary">Your privacy</h2>
          <p className="mt-3 font-medium text-text">Your ID is deleted once checked and never shared. Your police record is stored privately, and only employers you choose can see it.</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-text-light">
            <li>We keep as little as possible, for as short a time as possible.</li>
            <li>Your police record is encrypted and stored with our storage provider in the United States until your badge ends, then deleted automatically.</li>
            <li>We never record what your police record says. We note only that it is genuine, and its date.</li>
            <li>Employers are never told that someone tried verification and wasn&apos;t approved.</li>
            <li>We never send your police record by email. Employers open it on JobLink after logging in, and you can see each time they do.</li>
          </ul>
          <p className="mt-4 text-sm"><Link href="/privacy" className="font-semibold text-primary underline">Privacy policy</Link></p>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-primary">Questions</h2>
          <dl className="mt-5 divide-y divide-border">
            {FAQ.map(([question, answer]) => (
              <div key={question} className="py-4"><dt className="font-semibold text-text">{question}</dt><dd className="mt-1.5 text-text-light">{answer}</dd></div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl bg-primary/5 p-6 text-center">
          <p className="font-display text-xl font-bold text-text">EC$40 verification fee. 6 months of verified documents.</p>
          <p className="mt-2 text-text-light">Need a police record first? <Link href="/guides/police-record" className="font-semibold text-primary underline">How to get your police record in Antigua</Link></p>
          <Link href="/verification" className="mt-5 inline-flex rounded-lg bg-primary px-5 py-3 font-semibold text-white">Get verified, EC$40</Link>
          <p className="mt-4 text-sm text-text-muted">Have a confirmation from an applicant? <Link href="/verified/check" className="underline">Check a verification code</Link></p>
        </section>
      </div>
    </div>
  )
}
