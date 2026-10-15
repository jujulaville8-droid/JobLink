import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import CopyClaimLinkButton from '@/components/claims/CopyClaimLinkButton'

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) redirect('/dashboard')
  const rawPage = Number((await searchParams).page || 1)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1
  const { data: jobs, error, count } = await createAdminClient().from('job_listings')
    .select('id, title, status, companies!inner(id, company_name, claimed_at, users!inner(email, role, is_banned))', { count: 'exact' })
    .eq('posted_by_admin', true).order('created_at', { ascending: false }).order('id')
    .range((page - 1) * 25, page * 25 - 1)
  return <section className="mx-auto max-w-4xl px-4 py-10">
    <h1 className="font-display text-3xl">Jobs posted by JobLink</h1>
    <p className="mt-3 text-text-light">Give an employer control of their existing company and jobs. Verify the recipient’s authority before sending a private claim link.</p>
    <Link className="my-5 inline-block text-primary underline" href="/admin/post-job">Post a job</Link>
    {error ? <p role="alert">Could not load jobs. Please refresh and try again.</p> : !jobs?.length ? <p>No jobs on this page.</p> : <ul className="space-y-4">{jobs.map(job => {
      const company = Array.isArray(job.companies) ? job.companies[0] : job.companies
      const owner = Array.isArray(company.users) ? company.users[0] : company.users
      const claimable = !company.claimed_at && !owner.is_banned && owner.role === 'employer' && /^admin-company-.+@joblinkantigua\.com$/.test(owner.email)
      return <li key={job.id} className="space-y-3 rounded-xl border border-border bg-white p-5"><div><Link className="font-semibold text-primary underline" href={`/jobs/${job.id}`}>{job.title}</Link><p className="mt-1 text-sm text-text-light">{company.company_name} · {job.status.replaceAll('_', ' ')}</p></div>{claimable ? <CopyClaimLinkButton companyId={company.id} /> : <p className="text-sm text-text-light">Managed by an employer</p>}</li>
    })}</ul>}
    <nav aria-label="Jobs pages" className="mt-6 flex gap-6">{page > 1 && <Link href={`/admin/jobs?page=${page - 1}`}>Previous</Link>}{count && count > page * 25 ? <Link href={`/admin/jobs?page=${page + 1}`}>Next</Link> : null}</nav>
  </section>
}
