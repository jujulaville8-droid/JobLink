import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verificationEnabled } from '@/lib/verification/server'
import { BADGE_ELIGIBLE, BADGE_PERMIT, RTW_GROUPS } from '@/lib/verification/shared'

export const dynamic = 'force-dynamic'

const TITLE = 'JobLink Verified: show employers you can work in Antigua'
const DESCRIPTION = 'Get your right to work in Antigua and Barbuda checked once by JobLink, for free. Employers see a verified badge on your applications.'
export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://joblinkantigua.com/verified' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: 'https://joblinkantigua.com/verified', siteName: 'JobLink' },
}

const FAQ = [
  ['Does it cost anything?', 'No. JobLink Verified is free, and so is applying for jobs.'],
  ['Do I need it to apply?', 'No. It is optional. Anyone can browse jobs, build a resume, apply and message employers without it.'],
  ['What do employers see?', `A badge on your application: "${BADGE_ELIGIBLE}", or "${BADGE_PERMIT}" for work permit holders. When you choose, they can open a one-page confirmation written by JobLink with your name, the type of document checked and the date. It never shows ID numbers or photos.`],
  ['What happens to my document?', 'A JobLink reviewer checks it is genuine, current and yours, usually within 48 hours. The image is then deleted. We keep only the result: your group, the type of document and its expiry date.'],
  ['How long does the badge last?', 'Until the document we checked expires, and at most two years. We remind you 30 days before, and renewing is free.'],
  ['Will being verified get me the job?', 'We can’t promise that, and we never guarantee interviews or jobs. It saves employers a step, and the order employers see applications in does not change.'],
  ['Can I change my mind?', 'Yes. You can stop sharing with any employer or remove your badge at any time.'],
] as const

export default function VerifiedPage() {
  if (!verificationEnabled()) notFound()
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-br from-primary-dark to-primary py-14 text-white md:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <p className="inline-block rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">Free · Optional</p>
          <h1 className="mt-4 font-display text-3xl font-bold md:text-5xl">Show employers you can work in Antigua</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">Get your right to work checked once by JobLink. Employers see a verified badge on your applications.</p>
          <Link href="/verification" className="mt-7 inline-flex rounded-lg bg-white px-5 py-3 font-semibold text-primary">Get verified, free</Link>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-14 px-4 py-14">
        <section>
          <h2 className="font-display text-2xl font-bold text-primary">How it works</h2>
          <ol className="mt-5 space-y-4">
            {[
              ['Upload your document', 'Your passport, national ID card, residency document, CARICOM Skills Certificate or work permit. A clear photo is fine.'],
              ['We check it within 48 hours', 'A JobLink reviewer checks it is genuine, current and yours. Then the image is deleted.'],
              ['Apply with your badge', 'Your badge shows on your profile, and you can send a confirmation with any application. You choose each time.'],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{index + 1}</span>
                <div><p className="font-semibold text-text">{title}</p><p className="mt-1 text-text-light">{body}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold text-primary">Who can be verified</h2>
          <p className="mt-3 text-text-light">Anyone who can legally work in Antigua and Barbuda.</p>
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="bg-bg-alt text-text"><tr><th className="p-3 font-semibold">You are</th><th className="p-3 font-semibold">Document we accept</th></tr></thead>
              <tbody className="divide-y divide-border text-text-light">
                {Object.entries(RTW_GROUPS).map(([key, group]) => (
                  <tr key={key}><td className="p-3 align-top"><span className="font-medium text-text">{group.label}</span>{group.hint && <span className="block text-xs">{group.hint}</span>}</td><td className="p-3 align-top">{group.proof}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-text-muted">Work permit holders get the badge &ldquo;{BADGE_PERMIT}&rdquo;, because a permit is tied to one employer and position. Digital nomad visa holders and visitors can&apos;t be verified for local jobs.</p>
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
          <p className="font-display text-xl font-bold text-text">Free. Checked once. Lasts until your document expires.</p>
          <Link href="/verification" className="mt-5 inline-flex rounded-lg bg-primary px-5 py-3 font-semibold text-white">Get verified</Link>
          <p className="mt-4 text-sm text-text-muted">An employer with a JobLink confirmation? <Link href="/verified/check" className="underline">Check a verification code</Link> · <Link href="/privacy" className="underline">Privacy policy</Link></p>
        </section>
      </div>
    </div>
  )
}
