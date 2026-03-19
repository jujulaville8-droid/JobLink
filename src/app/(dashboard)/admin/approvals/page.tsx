import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { JOB_TYPE_LABELS, JobType } from '@/lib/types'
import { sendEmail, BASE_URL } from '@/lib/email'

async function notifyEmployer(supabase: Awaited<ReturnType<typeof createClient>>, jobId: string, type: 'listing_approved' | 'listing_rejected') {
  const { data: job } = await supabase
    .from('job_listings')
    .select('title, companies(user_id)')
    .eq('id', jobId)
    .single()

  if (!job) return

  const company = Array.isArray(job.companies) ? job.companies[0] : job.companies
  if (!company?.user_id) return

  const { data: employerUser } = await supabase
    .from('users')
    .select('email')
    .eq('id', company.user_id)
    .single()

  if (!employerUser?.email) return

  sendEmail({
    to: employerUser.email,
    type,
    data: {
      listing_title: job.title,
      dashboard_url: `${BASE_URL}/my-listings`,
    },
  })
}

async function approveJob(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const jobId = formData.get('job_id') as string

  await supabase
    .from('job_listings')
    .update({ status: 'active' })
    .eq('id', jobId)

  await notifyEmployer(supabase, jobId, 'listing_approved')
  revalidatePath('/admin/approvals')
}

async function rejectJob(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const jobId = formData.get('job_id') as string

  await supabase
    .from('job_listings')
    .update({ status: 'closed' })
    .eq('id', jobId)

  await notifyEmployer(supabase, jobId, 'listing_rejected')
  revalidatePath('/admin/approvals')
}

interface PendingCompany {
  id: string
  company_name: string
  logo_url: string | null
  industry: string | null
  location: string | null
  website: string | null
  description: string | null
  is_verified: boolean
  is_pro: boolean
}

interface PendingListing {
  id: string
  title: string
  description: string
  job_type: JobType
  location: string
  salary_min: number | null
  salary_max: number | null
  created_at: string
  companies: PendingCompany[] | null
}

export default async function AdminApprovalsPage() {
  await requireRole('admin')
  const supabase = await createClient()

  const { data: listings, error } = await supabase
    .from('job_listings')
    .select('id, title, description, job_type, location, salary_min, salary_max, created_at, companies(id, company_name, logo_url, industry, location, website, description, is_verified, is_pro)')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-red-600">Error loading approvals: {error.message}</p>
      </div>
    )
  }

  const pendingListings = (listings || []) as PendingListing[]

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold font-display text-primary sm:text-3xl">
        Pending Approvals
      </h1>
      <p className="mt-1 text-sm text-text-light">
        Review and approve or reject new job listings.
      </p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-white p-4 text-center">
          <p className="text-2xl font-bold text-text">{pendingListings.length}</p>
          <p className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">
            Pending
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-center">
          <p className="text-2xl font-bold text-text">
            {new Set(pendingListings.map(l => l.companies?.[0]?.company_name).filter(Boolean)).size}
          </p>
          <p className="mt-0.5 text-xs font-medium text-text-muted">Companies</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-center">
          <p className="text-2xl font-bold text-text">
            {pendingListings.length > 0
              ? Math.ceil((Date.now() - new Date(pendingListings[0].created_at).getTime()) / (1000 * 60 * 60))
              : 0}h
          </p>
          <p className="mt-0.5 text-xs font-medium text-text-muted">Oldest Wait</p>
        </div>
      </div>

      {pendingListings.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border bg-white p-10 text-center">
          <svg className="mx-auto h-16 w-16 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-text">All caught up!</h3>
          <p className="mt-1 text-sm text-text-light">All job listings have been reviewed.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {pendingListings.map((listing) => {
            const company = listing.companies?.[0]
            const companyName = company?.company_name || 'Unknown Company'
            const initials = companyName.charAt(0).toUpperCase()

            return (
              <details
                key={listing.id}
                className="group rounded-2xl border border-border bg-white transition-shadow hover:shadow-sm overflow-hidden"
              >
                <summary className="cursor-pointer list-none p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      {/* Company avatar */}
                      {company?.logo_url ? (
                        <img
                          src={company.logo_url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-xl object-cover border border-border"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-text truncate">
                            {listing.title}
                          </h3>
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/40">
                            Pending
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">{companyName}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="flex items-center gap-1 text-xs text-text-light">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            {listing.location}
                          </span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {JOB_TYPE_LABELS[listing.job_type] || listing.job_type}
                          </span>
                          {listing.salary_min && (
                            <span className="text-xs text-text-light">
                              EC${listing.salary_min.toLocaleString()}
                              {listing.salary_max ? `–${listing.salary_max.toLocaleString()}` : '+'}
                            </span>
                          )}
                          <span className="text-xs text-text-muted">
                            {new Date(listing.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <form action={approveJob}>
                        <input type="hidden" name="job_id" value={listing.id} />
                        <button
                          type="submit"
                          className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                      </form>
                      <form action={rejectJob}>
                        <input type="hidden" name="job_id" value={listing.id} />
                        <button
                          type="submit"
                          className="rounded-xl border-2 border-red-200 text-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </form>
                      <svg
                        className="h-5 w-5 text-text-light transition-transform group-open:rotate-180 ml-1"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </div>
                </summary>

                {/* Expanded details */}
                <div className="border-t border-border px-5 pb-5 pt-4 space-y-5">
                  {/* Company info card */}
                  {company && (
                    <div className="rounded-xl border border-border bg-bg-alt/50 p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-text-light mb-3">
                        Company Information
                      </h4>
                      <div className="flex items-start gap-3">
                        {company.logo_url ? (
                          <img src={company.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover border border-border" />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white font-bold">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-text">{companyName}</p>
                            {company.is_verified && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 border border-green-200">
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                Verified
                              </span>
                            )}
                            {company.is_pro && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                                Pro
                              </span>
                            )}
                          </div>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-text-light">
                            {company.industry && (
                              <p><span className="text-text-muted">Industry:</span> {company.industry}</p>
                            )}
                            {company.location && (
                              <p><span className="text-text-muted">Location:</span> {company.location}</p>
                            )}
                            {company.website && (
                              <p>
                                <span className="text-text-muted">Website:</span>{' '}
                                <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                  {company.website}
                                </a>
                              </p>
                            )}
                          </div>
                          {company.description && (
                            <p className="mt-2 text-xs text-text-light leading-relaxed line-clamp-3">
                              {company.description}
                            </p>
                          )}
                          <a
                            href={`/companies/${company.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            View full company profile
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Job description */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-light">
                      Full Description
                    </h4>
                    <div className="mt-2 text-sm text-text whitespace-pre-wrap leading-relaxed">
                      {listing.description}
                    </div>
                  </div>

                  {/* View listing link */}
                  <div className="pt-4 border-t border-border">
                    <a
                      href={`/jobs/${listing.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-dark transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Preview Listing
                    </a>
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}
