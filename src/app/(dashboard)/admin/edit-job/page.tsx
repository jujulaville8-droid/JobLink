import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { INDUSTRIES, JOB_TYPE_LABELS } from '@/lib/types'
import EditJobForm from './EditJobForm'

interface PageProps {
  searchParams: Promise<{ id?: string }>
}

export default async function AdminEditJobPage({ searchParams }: PageProps) {
  await requireRole('admin')
  const { id } = await searchParams
  if (!id) notFound()

  const { data: job } = await createAdminClient()
    .from('job_listings')
    .select('id, title, description, category, job_type, location, status, closes_after, companies(company_name)')
    .eq('id', id)
    .maybeSingle()
  if (!job) notFound()

  const company = Array.isArray(job.companies) ? job.companies[0] : job.companies
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/admin/featured" className="text-sm text-text-light hover:text-primary">&larr; Back to listings</Link>
      <h1 className="text-2xl font-bold font-display text-primary mt-4 mb-1">Edit job</h1>
      <p className="text-text-light text-sm mb-8">
        {(company as { company_name?: string } | null)?.company_name || 'Unknown company'} &middot; status: {job.status}.
        Saving keeps the current status.
      </p>
      <EditJobForm
        job={{
          id: job.id,
          title: job.title ?? '',
          description: job.description ?? '',
          category: job.category ?? '',
          job_type: job.job_type ?? '',
          location: job.location ?? '',
          closes_after: job.closes_after ?? '',
        }}
        categories={INDUSTRIES}
        jobTypes={JOB_TYPE_LABELS}
      />
    </div>
  )
}
