import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { statusLabels } from '@/lib/employer-pilot'
import { requestDeliveryStatus } from '@/lib/testimonials'
import EmployerEnquiryReview from '@/components/EmployerEnquiryReview'

export const dynamic = 'force-dynamic'
export default async function EmployerEnquiries({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireRole('admin')
  const query = await searchParams
  const page = Math.max(1, Math.min(10000, Math.floor(Number(query.page) || 1)))
  const { data, count, error } = await createAdminClient().from('employer_enquiries').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * 25, page * 25 - 1)
  if (error) throw new Error('Could not load employer requests')
  return <div className="mx-auto max-w-4xl space-y-6">
    <h1 className="font-display text-3xl">Employer requests</h1><p className="text-text-light">Contact each business, agree the vacancy details and record permission before publishing. Notification emails go to your existing JobLinks forwarding inbox. Requests are saved here even if email delivery fails.</p>
    <Link href="/employers/hiring-help" className="inline-block text-primary underline">Open the employer pilot page</Link>
    {!data?.length && <p className="rounded-2xl border bg-white p-8">No requests on this page. Share the employer pilot link to start conversations.</p>}
    {data?.map(row => <article id={row.id} key={row.id} className="scroll-mt-24 rounded-2xl border bg-white p-6">
      <p className="text-sm text-text-light">{new Date(row.created_at).toLocaleDateString('en-GB')} · {statusLabels[row.status as keyof typeof statusLabels]} · {row.source}</p>
      <h2 className="mt-2 text-xl font-semibold">{row.company_name} — {row.job_title}</h2>
      <p className="mt-3">{row.contact_name} · <a className="text-primary underline" href={`mailto:${row.email}?subject=${encodeURIComponent(`Your ${row.job_title} vacancy — JobLinks`)}`}>{row.email}</a>{row.phone && <span> · {row.phone}</span>}</p>
      <p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4">{row.details}</p>
      <p className="mt-3 text-xs text-text-light">Reference: {row.id.slice(0, 8).toUpperCase()} · Contact permission recorded · Notification: {requestDeliveryStatus(row.notification_sent_at, row.notification_started_at)}</p>
      <div className="mt-4 flex flex-wrap gap-4"><Link href={`/admin/post-job?enquiry=${row.id}`} className="font-semibold text-primary underline">Prepare listing from this request</Link>{row.listing_id && <Link className="text-primary underline" href={`/jobs/${row.listing_id}`}>View linked job</Link>}</div>
      <EmployerEnquiryReview key={row.updated_at} id={row.id} initialStatus={row.status} initialNotes={row.notes} listingId={row.listing_id} updatedAt={row.updated_at} />
    </article>)}
    <nav className="flex justify-between" aria-label="Requests pagination">{page > 1 ? <Link href={`?page=${page - 1}`}>← Previous</Link> : <span />}{(count ?? 0) > page * 25 && <Link href={`?page=${page + 1}`}>Next →</Link>}</nav>
  </div>
}
