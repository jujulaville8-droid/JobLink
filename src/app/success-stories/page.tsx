import Link from 'next/link'
import { approvedTestimonials } from '@/lib/testimonials'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Local hiring stories | JobLinks Antigua', description: 'Employer experiences hiring through JobLinks in Antigua and Barbuda.' }
export default async function SuccessStories() {
  const stories = await approvedTestimonials()
  return <main className="mx-auto max-w-4xl px-5 py-16">
    <p className="mb-3 font-semibold text-primary">Made for local hiring</p>
    <h1 className="font-display text-4xl">Real hires. In their own words.</h1>
    <p className="my-6 text-text-light">Experiences shared by employers after confirming a hire on JobLinks. Published with their permission.</p>
    <div className="my-8 grid gap-5 sm:grid-cols-2">{stories.map(story => <article key={story.id} className="rounded-2xl border bg-white p-6">
      <blockquote className="mb-5 whitespace-pre-wrap text-lg">“{story.feedback}”</blockquote>
      <h2 className="font-semibold">{story.company_name}</h2><p className="text-sm text-text-light">Hired for: {story.job_title}</p>
    </article>)}</div>
    {!stories.length && <p className="my-8 rounded-2xl border p-6">Our first employer stories will appear here once they’re shared and approved.</p>}
    <Link className="inline-block rounded-xl bg-primary px-6 py-3 font-semibold text-white" href="/signup?role=employer">Find your next hire</Link>
  </main>
}
