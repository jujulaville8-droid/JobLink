import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { FileText, Users, ClipboardCheck } from 'lucide-react';
import { safeJsonLd } from '@/lib/safe-sql';

const TITLE = 'Post a Job Free in Antigua and Barbuda | JobLink';
const DESCRIPTION = 'Hire in Antigua and Barbuda. Post a job for free on JobLink, reach local job seekers, and review applications in one place.';
const PAGE_URL = 'https://joblinkantigua.com/employers';

const inlineLinks: Record<string, string> = {
  'Create an employer account': '/signup?role=employer',
  'create an employer account': '/signup?role=employer',
  'hiring help page': '/employers/hiring-help',
};

const faqs = [
  {
    question: 'Can I post a job free in Antigua?',
    answer: 'Yes. Employers can post a job on JobLink at no charge. Create an employer account and submit the vacancy, or request help on the hiring help page.',
  },
  {
    question: 'How do I hire in Antigua and Barbuda with JobLink?',
    answer: 'Create an employer account, add the role, location and description, and submit the vacancy for review. After review, the job goes live on JobLink for job seekers in Antigua and Barbuda. You review the applications and decide who to interview.',
  },
  {
    question: 'Do I need a paid plan?',
    answer: 'No. Posting a job on JobLink is free.',
  },
  {
    question: 'Do I need an account?',
    answer: 'To post a job and review applications, create an employer account. You can request help on the hiring help page without an account.',
  },
  {
    question: 'Will my job appear on Google Jobs?',
    answer: 'Your job appears on JobLink for local job seekers after review. Appearance on Google Jobs is separate and is not guaranteed for every listing.',
  },
  {
    question: 'Is JobLink only for Antigua, or also Barbuda?',
    answer: 'JobLink is for employers and job seekers in Antigua and Barbuda.',
  },
  {
    question: 'Can I get help writing the vacancy?',
    answer: 'Yes. The hiring help page is a free first-vacancy pilot, and you can send the role without an account. A request does not guarantee a hire or a place in the pilot.',
  },
] as const;

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
};

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'en_AG',
    siteName: 'JobLink',
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    images: [{ url: '/images/colorful-buildings.jpg', width: 1200, height: 630, alt: 'JobLink for employers in Antigua and Barbuda' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/images/colorful-buildings.jpg'],
  },
};

function withLinks(answer: string) {
  const labels = Object.keys(inlineLinks).sort((a, b) => b.length - a.length);
  const nodes: ReactNode[] = [];
  let rest = answer;
  let key = 0;
  while (rest) {
    const found = labels
      .map((label) => ({ label, index: rest.indexOf(label) }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index)[0];
    if (!found) {
      nodes.push(rest);
      break;
    }
    if (found.index > 0) nodes.push(rest.slice(0, found.index));
    nodes.push(<Link key={key} href={inlineLinks[found.label]} className="font-semibold text-primary underline">{found.label}</Link>);
    key += 1;
    rest = rest.slice(found.index + found.label.length);
  }
  return nodes;
}

export default function EmployersPage() {
  return <div className="bg-white text-text">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqSchema) }} />
    <section className="mx-auto max-w-5xl px-6 py-20 text-center sm:py-28">
      <p className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-primary">For employers</p>
      <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">Post a job free<br className="hidden sm:block" /> and hire in Antigua</h1>
      <p className="mx-auto mt-7 max-w-3xl text-lg leading-relaxed text-text-light">
        <span className="block sm:text-2xl">JobLink is a free job board for employers in Antigua and Barbuda.</span>
        <span className="mt-4 block">Post a job free in Antigua, post a job in Antigua and Barbuda, and hire in Antigua and Barbuda. Reach local job seekers and review applications in one place.</span>
      </p>
      <Link href="/post-job" className="mt-9 inline-flex rounded-xl bg-primary px-9 py-4 text-lg font-semibold text-white transition-colors hover:bg-primary-dark">Post a job for free</Link>
      <p className="mt-5 text-text-muted">Local talent. Simple hiring.</p>
      <Link href="/signup?role=employer" className="mt-5 inline-block text-sm font-semibold text-primary underline">Create an employer account</Link>
      <Link href="/employers/hiring-help" className="mx-auto mt-3 block w-fit text-sm font-semibold text-primary underline">Get hiring help</Link>
    </section>
    <section id="how-it-works" className="bg-bg-alt px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl"><h2 className="mb-10 text-center font-display text-3xl font-bold sm:text-4xl">Your next hire starts here</h2>
        <div className="grid gap-6 md:grid-cols-3">{[
          { title: 'Create your job post', text: 'Add your role, location and what makes your team a great place to work. Start with an editable description draft.', icon: FileText },
          { title: 'Reach local job seekers', text: 'After review, your job goes live for people across Antigua and Barbuda to discover and apply.', icon: Users },
          { title: 'Review and hire', text: 'AI screening can help you review applications and choose who to interview. You make the hiring decisions.', icon: ClipboardCheck },
        ].map(({ title, text, icon: Icon }, index) => <article key={title} className="relative rounded-2xl border border-border bg-white p-8"><span className="absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{index + 1}</span><Icon className="mb-6 h-10 w-10 text-primary" strokeWidth={1.5} aria-hidden="true" /><h3 className="font-display text-xl font-bold">{title}</h3><p className="mt-4 leading-relaxed text-text-light">{text}</p></article>)}</div>
      </div>
    </section>
    <section className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
      <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">What you get</h2>
      <ul className="mt-8 space-y-4 text-lg leading-relaxed text-text-light">
        <li>Post a job in Antigua and Barbuda at no charge.</li>
        <li>After review, the job goes live on JobLink for people across Antigua and Barbuda.</li>
        <li>You can review applications in your employer account. AI screening can help, and you decide who to interview.</li>
      </ul>
      <h2 className="mt-14 text-center font-display text-3xl font-bold sm:text-4xl">Who this is for</h2>
      <p className="mt-6 text-lg leading-relaxed text-text-light">Local businesses that want to hire in Antigua and Barbuda.</p>
    </section>
    <section id="faq" className="bg-bg-alt px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center font-display text-3xl font-bold sm:text-4xl">Questions about posting a job</h2>
        <div className="mt-10 space-y-8">{faqs.map(({ question, answer }) => <div key={question}><h3 className="font-display text-xl font-bold">{question}</h3><p className="mt-3 leading-relaxed text-text-light">{withLinks(answer)}</p></div>)}</div>
      </div>
    </section>
    <section className="mx-auto max-w-3xl px-6 py-14 text-center sm:py-20">
      <h2 className="font-display text-3xl font-bold sm:text-4xl">See the board and get help</h2>
      <ul className="mt-8 space-y-3 text-sm font-semibold">
        <li><Link href="/employers/hiring-help" className="text-primary underline">Get hiring help</Link></li>
        <li><Link href="/jobs" className="text-primary underline">See jobs currently listed</Link></li>
        <li><Link href="/about" className="text-primary underline">About JobLink</Link></li>
        <li><Link href="/" className="text-primary underline">JobLink home</Link></li>
      </ul>
    </section>
  </div>;
}
