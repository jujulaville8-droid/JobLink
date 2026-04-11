import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import RunDiscoveryButton from './RunDiscoveryButton'

interface DiscoveredBusiness {
  id: string
  company_name: string
  email: string | null
  phone: string | null
  website: string | null
  sector: string | null
  location: string | null
  role_hiring_for: string | null
  source: string
  source_url: string | null
  evidence: string | null
  confidence_score: number | null
  status: 'pending_review' | 'approved' | 'rejected' | 'sent'
  notes: string | null
  discovered_at: string
  reviewed_at: string | null
  sent_at: string | null
}

// ─── Server Actions ────────────────────────────────────────────────────

async function approveBusiness(formData: FormData) {
  'use server'
  await requireRole('admin')
  const admin = createAdminClient()
  const id = formData.get('id') as string
  await admin
    .from('discovered_businesses')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/discovered')
}

async function rejectBusiness(formData: FormData) {
  'use server'
  await requireRole('admin')
  const admin = createAdminClient()
  const id = formData.get('id') as string
  await admin
    .from('discovered_businesses')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/discovered')
}

async function resetBusiness(formData: FormData) {
  'use server'
  await requireRole('admin')
  const admin = createAdminClient()
  const id = formData.get('id') as string
  await admin
    .from('discovered_businesses')
    .update({ status: 'pending_review', reviewed_at: null })
    .eq('id', id)
  revalidatePath('/admin/discovered')
}

// ─── Page ──────────────────────────────────────────────────────────────

export default async function AdminDiscoveredPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string }>
}) {
  await requireRole('admin')
  const params = await searchParams
  const statusFilter = params.status || 'pending_review'
  const sourceFilter = params.source || 'all'

  const admin = createAdminClient()

  let query = admin
    .from('discovered_businesses')
    .select('*')
    .order('confidence_score', { ascending: false, nullsFirst: false })
    .order('discovered_at', { ascending: false })

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }
  if (sourceFilter !== 'all') {
    query = query.eq('source', sourceFilter)
  }

  const { data: rows, error } = await query

  // Get status counts for the tab badges
  const { data: countRows } = await admin
    .from('discovered_businesses')
    .select('status')

  const statusCounts = {
    pending_review: 0,
    approved: 0,
    rejected: 0,
    sent: 0,
  }
  for (const r of countRows ?? []) {
    if (r.status in statusCounts) {
      statusCounts[r.status as keyof typeof statusCounts]++
    }
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <p className="text-red-600">Error loading queue: {error.message}</p>
      </div>
    )
  }

  const businesses = (rows || []) as DiscoveredBusiness[]

  const sourceBadgeColor: Record<string, string> = {
    google: 'bg-blue-50 text-blue-700 border-blue-200',
    facebook: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    indeed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    careers_page: 'bg-amber-50 text-amber-700 border-amber-200',
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-primary">Discovered Businesses</h1>
          <p className="text-sm text-text-muted mt-1">
            Businesses found by the discovery bot that are currently hiring in Antigua. Review and approve before outreach.
          </p>
        </div>
        <RunDiscoveryButton />
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['pending_review', 'approved', 'rejected', 'sent', 'all'] as const).map((s) => {
          const isActive = statusFilter === s
          const label = s === 'pending_review' ? 'Pending' : s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)
          const count = s === 'all' ? undefined : statusCounts[s as keyof typeof statusCounts]
          return (
            <a
              key={s}
              href={`/admin/discovered?status=${s}${sourceFilter !== 'all' ? `&source=${sourceFilter}` : ''}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                isActive
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-text-light border-border hover:border-primary/40'
              }`}
            >
              {label}
              {count !== undefined && (
                <span className={`ml-2 text-xs ${isActive ? 'text-white/80' : 'text-text-muted'}`}>{count}</span>
              )}
            </a>
          )
        })}
      </div>

      {/* Source Filter */}
      <form method="GET" className="flex gap-2 mb-6">
        <input type="hidden" name="status" value={statusFilter} />
        <select
          name="source"
          defaultValue={sourceFilter}
          className="px-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Sources</option>
          <option value="google">Google</option>
          <option value="facebook">Facebook</option>
          <option value="indeed">Indeed / Job Boards</option>
          <option value="careers_page">Careers Pages</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-light transition-colors"
        >
          Filter
        </button>
      </form>

      {/* Results */}
      {businesses.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-10 text-center">
          <p className="text-text-light">
            {statusFilter === 'pending_review'
              ? 'No pending businesses. Click "Run Discovery" to find more.'
              : `No businesses with status "${statusFilter}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {businesses.map((b) => (
            <div
              key={b.id}
              className="bg-white border border-border rounded-2xl p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-display text-lg font-semibold text-text">{b.company_name}</h3>
                    {b.confidence_score !== null && (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          b.confidence_score >= 8
                            ? 'bg-emerald-50 text-emerald-700'
                            : b.confidence_score >= 6
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        Score {b.confidence_score}/10
                      </span>
                    )}
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        sourceBadgeColor[b.source] || 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                    >
                      {b.source}
                    </span>
                  </div>
                  {b.role_hiring_for && (
                    <p className="text-sm text-primary font-medium mb-2">
                      Hiring: {b.role_hiring_for}
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-text-light mb-2">
                    {b.sector && <div><span className="text-text-muted">Sector:</span> {b.sector}</div>}
                    {b.location && <div><span className="text-text-muted">Location:</span> {b.location}</div>}
                    {b.email && (
                      <div>
                        <span className="text-text-muted">Email:</span>{' '}
                        <a href={`mailto:${b.email}`} className="text-primary hover:underline">
                          {b.email}
                        </a>
                      </div>
                    )}
                    {b.phone && (
                      <div>
                        <span className="text-text-muted">Phone:</span> {b.phone}
                      </div>
                    )}
                    {b.website && (
                      <div className="truncate">
                        <span className="text-text-muted">Website:</span>{' '}
                        <a href={b.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {b.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      </div>
                    )}
                    {b.source_url && (
                      <div className="truncate">
                        <span className="text-text-muted">Source:</span>{' '}
                        <a href={b.source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          View listing
                        </a>
                      </div>
                    )}
                  </div>
                  {b.evidence && (
                    <div className="text-xs bg-bg-alt border-l-2 border-primary/30 px-3 py-2 rounded mt-2">
                      <span className="text-text-muted">Evidence:</span> &ldquo;{b.evidence}&rdquo;
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  {b.status === 'pending_review' ? (
                    <>
                      <form action={approveBusiness}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                        >
                          Approve
                        </button>
                      </form>
                      <form action={rejectBusiness}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="w-full px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                        >
                          Reject
                        </button>
                      </form>
                    </>
                  ) : (
                    <>
                      <div
                        className={`text-center px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          b.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : b.status === 'sent'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                      </div>
                      <form action={resetBusiness}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="w-full px-3 py-1.5 bg-white border border-border text-text-light rounded-lg text-xs hover:border-primary/40 transition-colors"
                        >
                          Reset to Pending
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
