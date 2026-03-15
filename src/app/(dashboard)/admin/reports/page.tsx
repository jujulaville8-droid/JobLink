import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { sendEmail, BASE_URL } from '@/lib/email'
import ReportReplyForm from '@/components/ReportReplyForm'

interface ReportData {
  id: string
  reason: string
  created_at: string
  job_listings: {
    id: string
    title: string
    status: string
    companies: { company_name: string }[] | null
  } | null
  users: {
    id: string
    email: string
  } | null
}

async function dismissReport(formData: FormData) {
  'use server'
  const supabase = await createClient()
  await requireRole('admin')
  const reportId = formData.get('report_id') as string

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  await adminClient
    .from('reported_listings')
    .delete()
    .eq('id', reportId)

  revalidatePath('/admin/reports')
}

async function removeListingAction(formData: FormData) {
  'use server'
  const supabase = await createClient()
  await requireRole('admin')
  const jobId = formData.get('job_id') as string
  const reportId = formData.get('report_id') as string

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  // Close the listing
  await adminClient
    .from('job_listings')
    .update({ status: 'closed' })
    .eq('id', jobId)

  // Remove the report
  await adminClient
    .from('reported_listings')
    .delete()
    .eq('id', reportId)

  revalidatePath('/admin/reports')
}

export default async function AdminReportsPage() {
  await requireRole('admin')
  const supabase = await createClient()

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminClient = createAdminClient()

  const { data: reports, error } = await adminClient
    .from('reported_listings')
    .select(`
      id,
      reason,
      created_at,
      job_listings (
        id,
        title,
        status,
        companies ( company_name )
      ),
      users!reported_listings_reported_by_fkey (
        id,
        email
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-red-600">Error loading reports: {error.message}</p>
      </div>
    )
  }

  const reportsList = (reports || []) as unknown as ReportData[]

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold font-display text-primary sm:text-3xl">
        Reported Listings
      </h1>
      <p className="mt-1 text-sm text-text-light">
        Review reports submitted by users and take action.
      </p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-white p-4 text-center">
          <p className="text-2xl font-bold text-text">{reportsList.length}</p>
          <p className="mt-0.5 text-xs font-medium text-text-muted">Open Reports</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-center">
          <p className="text-2xl font-bold text-text">
            {new Set(reportsList.map(r => r.job_listings?.id).filter(Boolean)).size}
          </p>
          <p className="mt-0.5 text-xs font-medium text-text-muted">Unique Listings</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 text-center">
          <p className="text-2xl font-bold text-text">
            {reportsList.filter(r => r.job_listings?.status === 'active').length}
          </p>
          <p className="mt-0.5 text-xs font-medium text-text-muted">Active Listings</p>
        </div>
      </div>

      {/* Reports List */}
      {reportsList.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border bg-white p-10 text-center">
          <svg className="mx-auto h-16 w-16 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-text">All clear!</h3>
          <p className="mt-1 text-sm text-text-light">No reports to review right now.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {reportsList.map((report) => {
            const job = report.job_listings
            const reporter = report.users
            const company = job?.companies
              ? Array.isArray(job.companies) ? job.companies[0] : job.companies
              : null

            return (
              <details
                key={report.id}
                className="group rounded-2xl border border-border bg-white transition-shadow hover:shadow-sm overflow-hidden"
              >
                <summary className="cursor-pointer list-none p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      {/* Alert icon */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                        <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-text truncate">
                            {job?.title || 'Deleted Listing'}
                          </h3>
                          {job?.status && (
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                              job.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : job.status === 'closed'
                                ? 'bg-red-50 text-red-600'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                              {job.status.charAt(0).toUpperCase() + job.status.slice(1).replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {company?.company_name || 'Unknown Company'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-text-light">
                          <span className="flex items-center gap-1">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            {reporter?.email || 'Unknown'}
                          </span>
                          <span>&middot;</span>
                          <span>{new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>

                    <svg
                      className="h-5 w-5 text-text-light transition-transform group-open:rotate-180 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </summary>

                {/* Expanded details */}
                <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
                  {/* Report reason */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-light">
                      Report Reason
                    </h4>
                    <div className="mt-2 rounded-xl bg-red-50/60 border border-red-100 p-4">
                      <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
                        {report.reason}
                      </p>
                    </div>
                  </div>

                  {/* Reporter info */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-light">
                      Reported By
                    </h4>
                    <p className="mt-1 text-sm text-text">
                      {reporter?.email || 'Unknown user'}
                    </p>
                  </div>

                  {/* View listing link */}
                  {job?.id && (
                    <div>
                      <a
                        href={`/jobs/${job.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-dark transition-colors"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        View Listing
                      </a>
                    </div>
                  )}

                  {/* Reply to reporter */}
                  {reporter?.email && (
                    <ReportReplyForm reporterEmail={reporter.email} jobTitle={job?.title || 'a listing'} />
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <form action={dismissReport}>
                      <input type="hidden" name="report_id" value={report.id} />
                      <button
                        type="submit"
                        className="rounded-xl border-2 border-border px-4 py-2 text-sm font-medium text-text-light hover:border-primary/30 hover:text-primary transition-colors cursor-pointer"
                      >
                        Dismiss Report
                      </button>
                    </form>

                    {job?.id && job?.status === 'active' && (
                      <form action={removeListingAction}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="report_id" value={report.id} />
                        <button
                          type="submit"
                          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer"
                        >
                          Remove Listing
                        </button>
                      </form>
                    )}
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
