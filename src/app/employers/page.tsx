import Link from 'next/link';
import { FileText, Users, ClipboardCheck } from 'lucide-react';

export const metadata = {
  title: 'Hire in Antigua and Barbuda | JobLink for Employers',
  description: 'Find your next great hire in Antigua. Post a job for free, reach local candidates and review applications with JobLink.',
  alternates: { canonical: 'https://joblinkantigua.com/employers' },
};

export default function EmployersPage() {
  return <div className="bg-white text-text">
    <section className="mx-auto max-w-5xl px-6 py-20 text-center sm:py-28">
      <p className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-primary">For employers</p>
      <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">Find your next great hire<br className="hidden sm:block" /> in Antigua.</h1>
      <p className="mx-auto mt-7 max-w-3xl text-lg leading-relaxed text-text-light sm:text-2xl">Reach local job seekers with free job posting and AI screening of applications.</p>
      <Link href="/post-job" className="mt-9 inline-flex rounded-xl bg-primary px-9 py-4 text-lg font-semibold text-white transition-colors hover:bg-primary-dark">Post a job for free</Link>
      <p className="mt-5 text-text-muted">Local talent. Simple hiring.</p>
      <Link href="/signup?role=employer" className="mt-5 inline-block text-sm font-semibold text-primary underline">Create an employer account</Link>
    </section>
    <section id="how-it-works" className="bg-bg-alt px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl"><h2 className="mb-10 text-center font-display text-3xl font-bold sm:text-4xl">Your next hire starts here</h2>
        <div className="grid gap-6 md:grid-cols-3">{[
          { title: 'Create your job post', text: 'Add your role, location and what makes your team a great place to work. Start with an editable description draft.', icon: FileText },
          { title: 'Reach local job seekers', text: 'After review, your job goes live for people across Antigua and Barbuda to discover and apply.', icon: Users },
          { title: 'Review and hire', text: 'Use AI screening to help review applications and choose who to interview. You make the hiring decisions.', icon: ClipboardCheck },
        ].map(({ title, text, icon: Icon }, index) => <article key={title} className="relative rounded-2xl border border-border bg-white p-8"><span className="absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{index + 1}</span><Icon className="mb-6 h-10 w-10 text-primary" strokeWidth={1.5} aria-hidden="true" /><h3 className="font-display text-xl font-bold">{title}</h3><p className="mt-4 leading-relaxed text-text-light">{text}</p></article>)}</div>
      </div>
    </section>
  </div>;
}
