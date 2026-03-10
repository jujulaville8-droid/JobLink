import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { JOB_TYPE_LABELS, JobType } from '@/lib/types'

async function approveJob(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const jobId = formData.get('job_id') as string

  await supabase
    .from('job_listings')
    .update({ status: 'active' })
    .eq('id', jobId)
}

async function rejectJob(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const jobId = formData.get('job_id') as string

  await supabase
    .from('job_listings')
    .update({ status: 'closed' })
    .eq('id', jobId)
}

interface PendingListing {
  id: string
  title: string
  description: string
  job_type: JobType
  location: string
  created_at: string
  companies: {
    company_name: string
  }[] | null
}

export default async function AdminApprovalsPage() {
  await requireRole('admin')
  const supabase = await createClient()

  const { data: listings, error } = await supabase
    .from('job_listings')
    .select('id, title, description, job_type, location, created_at, companies(company_name)')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-red-600">Error loading approvals: {error.message}</p>
      </div>
    )
  }

  const pendingListings = (listings || []) as PendingListing[]

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-primary mb-6">Pending Approvals</h1>

      {pendingListings.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-10 text-center">
          <div className="text-4xl mb-3">&#10003;</div>
          <p className="text-text-light text-lg">No pending approvals</p>
          <p className="text-text-light text-sm mt-1">All job listings have been reviewed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingListings.map((listing) => (
            <details
              key={listing.id}
              className="group bg-white rounded-xl border border-border overflow-hidden hover:border-primary/30 transition-colors"
            >
              <summary className="cursor-pointer p-5 list-none">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-text text-base">{listing.title}</h3>
                    <p className="text-sm text-text-light mt-0.5">
                      {listing.companies?.[0]?.company_name || 'Unknown Company'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="flex items-center gap-1 text-xs text-text-light">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {listing.location}
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {JOB_TYPE_LABELS[listing.job_type] || listing.job_type}
                      </span>
                      <span className="text-xs text-text-light">
                        Posted {new Date(listing.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <form action={approveJob}>
                      <input type="hidden" name="job_id" value={listing.id} />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Approve
                      </button>
                    </form>
                    <form action={rejectJob}>
                      <input type="hidden" name="job_id" value={listing.id} />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Reject
                      </button>
                    </form>
                    <span className="text-text-light ml-2 text-xs group-open:rotate-180 transition-transform">
                      &#9660;
                    </span>
                  </div>
                </div>
              </summary>
              <div className="px-5 pb-5 border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-text mb-2">Full Description</h4>
                <div className="text-sm text-text-light whitespace-pre-wrap leading-relaxed">
                  {listing.description}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
