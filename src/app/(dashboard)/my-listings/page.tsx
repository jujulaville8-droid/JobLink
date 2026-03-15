import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { JOB_TYPE_LABELS, type JobListing, type JobStatus, type JobType } from '@/lib/types';
import DeleteListingButton from '@/components/DeleteListingButton';

function StatusBadge({ status }: { status: JobStatus }) {
  const styles: Record<JobStatus, string> = {
    active: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
    pending_approval: 'bg-amber-50 text-amber-700 border border-amber-200/60',
    closed: 'bg-gray-100 text-gray-500 border border-gray-200/60',
  };
  const labels: Record<JobStatus, string> = {
    active: 'Active',
    pending_approval: 'Pending',
    closed: 'Closed',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {status === 'active' && (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
      {labels[status]}
    </span>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface ListingWithCounts extends JobListing {
  applicant_count: number;
}

async function getListings(
  companyId: string,
  filter: string
): Promise<ListingWithCounts[]> {
  const supabase = await createClient();

  let query = supabase
    .from('job_listings')
    .select('*, applications(count)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (filter === 'active') {
    query = query.eq('status', 'active');
  } else if (filter === 'pending') {
    query = query.eq('status', 'pending_approval');
  } else if (filter === 'closed') {
    query = query.eq('status', 'closed');
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return data.map((listing: Record<string, unknown>) => {
    const apps = listing.applications as { count: number }[] | undefined;
    return {
      ...listing,
      applicant_count: apps?.[0]?.count ?? 0,
    } as ListingWithCounts;
  });
}

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!company) {
    redirect('/company-profile');
  }

  const params = await searchParams;
  const filter = params.filter ?? 'all';
  const listings = await getListings(company.id, filter);

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'pending', label: 'Pending' },
    { key: 'closed', label: 'Closed' },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-text sm:text-3xl">
            My Job Listings
          </h1>
          <p className="mt-1 text-sm text-text-light">
            Manage your posted jobs and view applicants.
          </p>
        </div>
        <Link
          href="/post-job"
          className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0"
        >
          <svg className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Post New Job
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-1 overflow-x-auto rounded-xl border border-border bg-bg-alt p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/my-listings${tab.key === 'all' ? '' : `?filter=${tab.key}`}`}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
              filter === tab.key
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-light hover:text-text hover:bg-white/50'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Listings */}
      {listings.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-alt">
            <svg
              className="h-8 w-8 text-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-text">
            No listings found
          </h3>
          <p className="mt-1 text-sm text-text-light max-w-sm mx-auto">
            {filter === 'all'
              ? "You haven't posted any jobs yet. Click the button above to get started."
              : `No ${filter} listings found.`}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {listings.map((listing) => (
            <div
              key={listing.id}
              className="group rounded-2xl border border-border bg-white p-5 sm:p-6 transition-all duration-300 hover:border-primary/20 hover:shadow-md hover:shadow-primary/[0.04]"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-base font-semibold text-text group-hover:text-primary transition-colors duration-200">
                      {listing.title}
                    </h3>
                    <StatusBadge status={listing.status} />
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-text-light">
                    {listing.location && (
                      <span className="flex items-center gap-1">
                        <svg
                          className="h-3.5 w-3.5 text-text-muted"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {listing.location}
                      </span>
                    )}
                    <span className="rounded-full bg-primary/5 px-2.5 py-0.5 font-medium text-primary">
                      {JOB_TYPE_LABELS[listing.job_type as JobType] ?? listing.job_type}
                    </span>
                    <span>Posted {formatDate(listing.created_at)}</span>
                    {listing.expires_at && (
                      <span className="text-text-muted">Expires {formatDate(listing.expires_at)}</span>
                    )}
                  </div>
                </div>

                {/* Applicant count badge */}
                <Link
                  href={`/my-listings/${listing.id}/applicants`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 sm:py-2 text-sm font-medium text-text transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                  <span className="font-semibold">{listing.applicant_count}</span>
                  Applicant{listing.applicant_count !== 1 ? 's' : ''}
                </Link>
              </div>

              {/* Actions */}
              <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 border-t border-border/60 pt-4">
                <Link
                  href={`/my-listings/${listing.id}/applicants`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/5 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:shadow-md hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  View Applicants
                </Link>

                {(listing.status === 'pending_approval' || listing.status === 'active') && (
                  <Link
                    href={`/post-job?edit=${listing.id}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-text transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit Listing
                  </Link>
                )}

                {listing.status === 'active' && (
                  <CloseListing listingId={listing.id} />
                )}

                {listing.status === 'closed' && (
                  <RepostListing listingId={listing.id} />
                )}

                <DeleteListing listingId={listing.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CloseListing({ listingId }: { listingId: string }) {
  async function close() {
    'use server';
    const supabase = await createClient();
    const user = await requireAuth();
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!company) return;

    await supabase
      .from('job_listings')
      .update({ status: 'closed' })
      .eq('id', listingId)
      .eq('company_id', company.id);

    redirect('/my-listings');
  }

  return (
    <form action={close}>
      <button
        type="submit"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-red-600 transition-all duration-200 hover:bg-red-600 hover:text-white hover:border-red-600 hover:shadow-md hover:shadow-red-600/20 hover:-translate-y-0.5 active:translate-y-0"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        Close Listing
      </button>
    </form>
  );
}

function DeleteListing({ listingId }: { listingId: string }) {
  async function deleteListing() {
    'use server';
    const supabase = await createClient();
    const user = await requireAuth();
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!company) return;

    // Verify this listing belongs to the employer's company
    const { data: listing } = await supabase
      .from('job_listings')
      .select('id')
      .eq('id', listingId)
      .eq('company_id', company.id)
      .single();
    if (!listing) return;

    // Use admin client to bypass RLS (no DELETE policies exist)
    // Ownership already verified above. CASCADE handles applications & conversations.
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const adminDb = createAdminClient();

    await adminDb
      .from('job_listings')
      .delete()
      .eq('id', listingId);

    redirect('/my-listings');
  }

  return <DeleteListingButton action={deleteListing} />;
}

function RepostListing({ listingId }: { listingId: string }) {
  async function repost() {
    'use server';
    const supabase = await createClient();
    const user = await requireAuth();
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!company) return;

    const { data: original } = await supabase
      .from('job_listings')
      .select('*')
      .eq('id', listingId)
      .eq('company_id', company.id)
      .single();

    if (!original) return;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await supabase.from('job_listings').insert({
      company_id: original.company_id,
      title: original.title,
      description: original.description,
      category: original.category,
      job_type: original.job_type,
      location: original.location,
      salary_min: original.salary_min,
      salary_max: original.salary_max,
      salary_visible: original.salary_visible,
      requires_work_permit: original.requires_work_permit,
      status: 'active',
      expires_at: expiresAt.toISOString(),
    });

    redirect('/my-listings');
  }

  return (
    <form action={repost}>
      <button
        type="submit"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-emerald-700 transition-all duration-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-md hover:shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        Repost Listing
      </button>
    </form>
  );
}
