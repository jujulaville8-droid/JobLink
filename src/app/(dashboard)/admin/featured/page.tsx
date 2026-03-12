import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { JOB_TYPE_LABELS, JobType } from '@/lib/types'

async function toggleFeatured(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const jobId = formData.get('job_id') as string
  const currentlyFeatured = formData.get('is_featured') === 'true'

  await supabase
    .from('job_listings')
    .update({ is_featured: !currentlyFeatured })
    .eq('id', jobId)

  revalidatePath('/admin/featured')
}

interface ListingRow {
  id: string
  title: string
  job_type: JobType
  location: string
  is_featured: boolean
  created_at: string
  companies: {
    company_name: string
  }[] | null
}

export default async function AdminFeaturedPage() {
  await requireRole('admin')
  const supabase = await createClient()

  const { data: listings, error } = await supabase
    .from('job_listings')
    .select('id, title, job_type, location, is_featured, created_at, companies(company_name)')
    .eq('status', 'active')
    .order('is_featured', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-red-600">Error loading listings: {error.message}</p>
      </div>
    )
  }

  const allListings = (listings || []) as ListingRow[]
  const featuredListings = allListings.filter((l) => l.is_featured)
  const regularListings = allListings.filter((l) => !l.is_featured)

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold font-display text-primary mb-2">Featured Listings</h1>
      <p className="text-text-light text-sm mb-8">
        Toggle listings to feature them at the top of search results.
      </p>

      {/* Currently Featured */}
      {featuredListings.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">
            Currently Featured ({featuredListings.length})
          </h2>
          <div className="space-y-2">
            {featuredListings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center gap-4 bg-accent/5 border border-accent/20 rounded-[--radius-card] p-4"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text text-sm">{listing.title}</h3>
                  <p className="text-xs text-text-light mt-0.5">
                    {listing.companies?.[0]?.company_name || 'Unknown'} &middot; {listing.location} &middot;{' '}
                    {JOB_TYPE_LABELS[listing.job_type] || listing.job_type}
                  </p>
                </div>
                <form action={toggleFeatured}>
                  <input type="hidden" name="job_id" value={listing.id} />
                  <input type="hidden" name="is_featured" value="true" />
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors"
                  >
                    Remove Featured
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Active Listings */}
      <div>
        <h2 className="text-sm font-semibold text-text uppercase tracking-wider mb-3">
          Active Listings ({regularListings.length})
        </h2>
        {regularListings.length === 0 ? (
          <p className="text-text-light text-sm py-6 text-center">No active listings to feature.</p>
        ) : (
          <div className="space-y-2">
            {regularListings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center gap-4 bg-white border border-border rounded-[--radius-card] p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text text-sm">{listing.title}</h3>
                  <p className="text-xs text-text-light mt-0.5">
                    {listing.companies?.[0]?.company_name || 'Unknown'} &middot; {listing.location} &middot;{' '}
                    {JOB_TYPE_LABELS[listing.job_type] || listing.job_type}
                  </p>
                </div>
                <form action={toggleFeatured}>
                  <input type="hidden" name="job_id" value={listing.id} />
                  <input type="hidden" name="is_featured" value="false" />
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary-light transition-colors"
                  >
                    Set Featured
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
