import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { caseSnippet } from '@/lib/testimonial-content'
import TestimonialReview from '@/components/TestimonialReview'
import { requestDeliveryStatus } from '@/lib/testimonials'

export const dynamic = 'force-dynamic'
export default async function TestimonialsAdmin() {
  await requireRole('admin')
  const { data, error } = await createAdminClient().from('placements').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error('Could not load testimonials')
  return <div className="mx-auto max-w-4xl space-y-6">
    <h1 className="font-display text-3xl">Hiring stories</h1>
    <p className="text-text-light">The latest 200 confirmed hires. Choose the strongest honest stories for the website and future outreach. Approval requires sharing permission and a rating of 4 or 5. Check for private information before approving. Edits or withdrawn permission remove approval automatically.</p>
    {!data?.length && <p className="rounded-xl border bg-white p-8">No confirmed hires yet. Employers can confirm a hire from their listing’s applicant list.</p>}
    {data?.map(p => <article key={p.id} className="space-y-3 rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-semibold">{p.company_name} · {p.job_title}</h2>
      <p className="text-sm text-text-light">{new Date(p.created_at).toLocaleDateString('en-GB')} · {p.review_status} · Request: {requestDeliveryStatus(p.request_sent_at, p.request_started_at)}</p>
      {p.feedback && <>
        <p>{p.rating}/5 · Sharing permission: {p.consent ? 'Yes' : 'No'}</p>
        <blockquote className="whitespace-pre-wrap border-l-4 border-primary pl-4">{p.feedback}</blockquote>
        <div className="rounded-xl bg-primary/5 p-4"><p className="mb-2 text-xs font-semibold uppercase">Case snippet preview</p><p>{p.company_name} · {p.job_title}</p><p>“{caseSnippet(p.feedback)}”</p></div>
        <TestimonialReview id={p.id} updatedAt={p.updated_at} eligible={p.consent && p.rating >= 4} />
      </>}
    </article>)}
  </div>
}
