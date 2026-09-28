import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import TestimonialForm from '@/components/TestimonialForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your hiring experience | JobLinks', robots: { index: false, follow: false } }

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/placement-feedback/${id}`)}`)
  const { data: placement, error } = await db.from('placements').select('id, company_name, job_title, feedback, rating, consent').eq('id', id).eq('employer_id', user.id).maybeSingle()
  if (error) throw new Error('Could not load feedback')
  if (!placement) notFound()
  return <main className="mx-auto max-w-2xl px-5 py-16">
    <p className="mb-3 font-semibold text-primary">Your hiring story</p>
    <h1 className="font-display text-3xl">How did your JobLinks hire go?</h1>
    <p className="my-6 text-text-light">{placement.company_name} · {placement.job_title}. A short, honest review helps us improve. Sharing it publicly is your choice.</p>
    <TestimonialForm id={id} initialFeedback={placement.feedback ?? ''} initialRating={placement.rating ?? 0} initialConsent={placement.consent} />
  </main>
}
