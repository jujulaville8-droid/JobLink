import type { Metadata } from 'next'
import Link from 'next/link'
import EmployerEnquiryForm from '@/components/EmployerEnquiryForm'
import { approvedTestimonials } from '@/lib/testimonials'
import { caseSnippet } from '@/lib/testimonial-content'
import { PILOT_URL } from '@/lib/employer-pilot'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Send us your vacancy | Hiring help in Antigua | JobLinks',
  description: 'Need staff in Antigua and Barbuda? Send JobLinks your vacancy. Our free first-vacancy pilot helps with the advert, reaching job seekers and reviewing applications.',
  alternates: { canonical: PILOT_URL },
}

export default async function HiringHelpPage() {
  // Proof is optional; intake must remain usable if the story service is down.
  const stories = await approvedTestimonials().catch(() => [])
  return <main className="bg-[#fbfaf7] text-slate-900">
    <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-14 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-16 md:py-24">
      <div>
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.15em] text-teal-800">For employers in Antigua &amp; Barbuda</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">You have a business to run.<br /><span className="text-teal-800">Let us help with the hiring.</span></h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">Send us the role you need to fill. We’ll help prepare your vacancy, reach relevant job seekers and review applications against the requirements you agree with us.</p>
        <a href="#vacancy" className="mt-8 inline-block rounded-xl bg-teal-800 px-7 py-4 font-semibold text-white hover:bg-teal-900">Send us your vacancy <span aria-hidden="true">→</span></a>
        <p className="mt-3 text-sm text-slate-500">Free first-vacancy pilot · No account needed</p>
      </div>
      <aside className="rounded-3xl border border-teal-900/10 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold uppercase tracking-wider text-teal-800">A person helping you hire</p>
        <h2 className="mt-3 font-display text-3xl">Hi, I’m Julian.</h2>
        <p className="mt-4 leading-7 text-slate-600">I’m the founder of JobLinks. I’m opening a hands-on pilot for local employers who need help preparing a vacancy and finding suitable applicants.</p>
        <p className="mt-4 leading-7 text-slate-600">Tell me what you need and where hiring has been difficult. We’ll confirm whether this pilot is a fit before we start.</p>
        <p className="mt-6 border-t pt-5 text-sm text-slate-500">Your first supported vacancy is free. Any future paid service would be discussed and agreed separately.</p>
      </aside>
    </section>
    <section className="border-y border-teal-900/10 bg-white py-14">
      <div className="mx-auto max-w-6xl px-5"><h2 className="font-display text-3xl">Less setup. More help with the actual vacancy.</h2>
        <div className="mt-8 grid gap-8 md:grid-cols-3">{[
          ['01', 'We shape the advert', 'Send an existing advert or a rough description. We’ll help clarify the duties, hours, pay and requirements with you.'],
          ['02', 'We help it reach people', 'Once you approve the details, we’ll publish the vacancy on JobLinks and share it with relevant job seekers.'],
          ['03', 'We help you review', 'We’ll help check applications against your agreed requirements and follow up with you. You decide who to interview and hire.'],
        ].map(([number, title, description]) => <article key={number}><p className="text-sm font-semibold text-teal-700">{number}</p><h3 className="mt-3 text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-600">{description}</p></article>)}</div>
      </div>
    </section>
    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <div><h2 className="font-display text-3xl">Start with what you know.</h2><p className="mt-4 leading-7 text-slate-600">Your business name, contact details and a little about the vacancy are enough to start. You don’t need to create a profile or write a perfect advert.</p>
        <h3 className="mt-8 text-lg font-semibold">What happens after you send it?</h3>
        <ol className="mt-4 list-decimal space-y-4 pl-5 leading-7 text-slate-600"><li>We review your request and contact you about the role.</li><li>We agree the requirements, wording and next steps together.</li><li>You approve the vacancy before it goes live.</li></ol>
        <p className="mt-8 text-sm leading-6 text-slate-500">Submitting a request doesn’t guarantee a hire, applicant numbers or a place in the pilot. We’ll be clear about what we can help with.</p>
        {stories.slice(0, 1).map(story => <blockquote key={story.id} className="mt-8 rounded-2xl bg-teal-50 p-6"><p className="leading-7">“{caseSnippet(story.feedback!)}”</p><footer className="mt-3 text-sm text-teal-900">{story.company_name} · {story.job_title}<br /><Link className="underline" href="/success-stories">Read employer stories</Link></footer></blockquote>)}
      </div>
      <div id="vacancy" className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><h2 className="mb-2 font-display text-3xl">Send us your vacancy</h2><p className="mb-7 text-slate-500">Tell us who you need. We’ll take it from there together.</p><EmployerEnquiryForm /></div>
    </section>
    <section className="mx-auto max-w-3xl px-5 pb-20"><h2 className="mb-6 font-display text-3xl">A few things you might be wondering</h2>{[
      ['Is it really free?', 'Yes. Your first supported vacancy in this pilot is free. No card details, subscription or automatic upgrade.'],
      ['Can I still use Facebook or another job site?', 'Yes. You can keep using your existing hiring channels. Send us the advert you already have and we’ll discuss how JobLinks can help.'],
      ['Do I have to create an account?', 'You can request help without an account. If we need an employer account later to manage applications, we’ll help you set it up.'],
      ['Will this publish my contact details?', 'Your name, email and phone are for following up on your request. We’ll agree any public contact details with you before publishing the vacancy.'],
    ].map(([question, answer]) => <details key={question} className="border-b border-slate-200 py-5"><summary className="cursor-pointer text-lg font-medium">{question}</summary><p className="mt-3 leading-7 text-slate-600">{answer}</p></details>)}
      <p className="mt-8 text-sm text-slate-600">Questions before you start? Include them with your request and we’ll discuss them with you.</p>
    </section>
  </main>
}
