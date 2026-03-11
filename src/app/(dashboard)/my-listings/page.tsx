import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { JOB_TYPE_LABELS, type JobListing, type JobStatus, type JobType } from '@/lib/types';

function StatusBadge({ status }: { status: JobStatus }) {
  const styles: Record<JobStatus, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    pending_approval: 'bg-accent-warm/10 text-amber-700',
    closed: 'bg-bg-alt text-text-light',
  };
  const labels: Record<JobStatus, string> = {
    active: 'Active',
    pending_approval: 'Pending Approval',
    closed: 'Closed',
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
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
    { key: 'pending', label: 'Pending Approval' },
    { key: 'closed', label: 'Closed' },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-primary sm:text-3xl">
            My Job Listings
          </h1>
          <p className="mt-1 text-sm text-text-light">
            Manage your posted jobs and view applicants.
          </p>
        </div>
        <Link
          href="/post-job"
          className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          + Post New Job
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 overflow-x-auto rounded-lg border border-border bg-bg-alt p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/my-listings${tab.key === 'all' ? '' : `?filter=${tab.key}`}`}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-light hover:text-text'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Listings */}
      {listings.length === 0 ? (
        <div className="mt-12 text-center">
          <svg
            className="mx-auto h-16 w-16 text-border"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-text">
            No listings found
          </h3>
          <p className="mt-1 text-sm text-text-light">
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
              className="rounded-[--radius-card] border border-border bg-white p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-text">
                      {listing.title}
                    </h3>
                    <StatusBadge status={listing.status} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-light">
                    <span className="flex items-center gap-1">
                      <svg
                        className="h-3.5 w-3.5"
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
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                      {JOB_TYPE_LABELS[listing.job_type as JobType] ?? listing.job_type}
                    </span>
                    <span>Posted {formatDate(listing.created_at)}</span>
                    {listing.expires_at && (
                      <span>Expires {formatDate(listing.expires_at)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Link
                    href={`/my-listings/${listing.id}/applicants`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium text-text transition-colors hover:bg-bg-alt"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87" />
                      <path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                    {listing.applicant_count} Applicant
                    {listing.applicant_count !== 1 ? 's' : ''}
                  </Link>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <Link
                  href={`/my-listings/${listing.id}/applicants`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View Applicants
                </Link>
                {listing.status === 'pending_approval' && (
                  <Link
                    href={`/post-job?edit=${listing.id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Edit
                  </Link>
                )}
                {listing.status === 'active' && (
                  <CloseListing listingId={listing.id} />
                )}
                {listing.status === 'closed' && (
                  <RepostListing listingId={listing.id} />
                )}
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
        className="text-xs font-medium text-red-600 hover:underline"
      >
        Close Listing
      </button>
    </form>
  );
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
      status: 'pending_approval',
      expires_at: expiresAt.toISOString(),
    });

    redirect('/my-listings');
  }

  return (
    <form action={repost}>
      <button
        type="submit"
        className="text-xs font-medium text-accent hover:underline"
      >
        Repost
      </button>
    </form>
  );
}
