import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { loadShortlistData, recordShortlistOpen } from '@/lib/shortlist/load';
import { applyNewMarkers, buildShortlist, shortlistProgress, toClientEntry } from '@/lib/shortlist/ranking';
import ShortlistBoard from '@/components/shortlist/ShortlistBoard';
import MobileReview from '@/components/shortlist/MobileReview';

const STATUS_LABELS: Record<string, string> = {
  active: 'Open role',
  closed: 'Closed',
  pending_approval: 'Pending approval',
};

export default async function ShortlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const supabase = await createClient();

  // Verify listing belongs to this employer (same checks as the applicants page)
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!company) {
    redirect('/company-profile');
  }

  const { data: listing } = await supabase
    .from('job_listings')
    .select('id, title, company_id')
    .eq('id', id)
    .eq('company_id', company.id)
    .single();

  if (!listing) {
    redirect('/my-listings');
  }

  const [data, { data: companyJobs }] = await Promise.all([
    loadShortlistData(supabase, id, user.id),
    supabase.from('job_listings').select('id, title').eq('company_id', company.id).order('created_at', { ascending: false }),
  ]);

  const job = data.job ?? { id, title: listing.title as string, status: null, description: null, category: null };
  const { entries: ranked, passed } = buildShortlist({
    job,
    applications: data.applications,
    verdicts: data.verdicts,
    overrides: data.overrides,
  });
  const entries = applyNewMarkers(ranked, data.lastOpenedAt);
  const progress = shortlistProgress(
    entries,
    data.applications.map(a => ({ id: a.id, status: a.status, overrides: data.overrides.get(a.id) })),
  );

  // Clear "new" markers for the next visit. Tolerates a missing table.
  await recordShortlistOpen(supabase, user.id, id);

  // The internal match score never leaves the server.
  const clientEntries = entries.map(toClientEntry);
  const clientPassed = passed.map(toClientEntry);
  const jobs = ((companyJobs ?? []) as { id: string; title: string }[]).map(j => ({ id: j.id, title: j.title }));
  if (!jobs.some(j => j.id === id)) jobs.unshift({ id, title: job.title });
  const statusLabel = job.status ? STATUS_LABELS[job.status] : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-text-light">
        <Link href="/my-listings" className="text-primary hover:text-primary-dark">
          Jobs
        </Link>
        <span className="mx-2" aria-hidden="true">/</span>
        <span>{job.title}</span>
      </nav>

      <div className="mt-3 hidden flex-wrap items-center justify-between gap-4 md:flex">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text">{job.title}</h1>
          {statusLabel && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                job.status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-bg-alt text-text-light'
              }`}
            >
              {statusLabel}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-text">
          Reviewed {progress.reviewed} of {progress.total} - {progress.interviewReady} interview-ready
        </p>
      </div>
      <h1 className="sr-only md:hidden">{job.title} shortlist</h1>

      <div className="mt-4 flex gap-1 rounded-xl border border-border bg-bg-alt p-1 text-sm font-medium sm:inline-flex">
        <span aria-current="page" className="flex-1 rounded-lg bg-white px-4 py-1.5 text-center text-primary shadow-sm">
          Shortlist
        </span>
        <Link
          href={`/my-listings/${id}/applicants`}
          className="flex-1 rounded-lg px-4 py-1.5 text-center text-text-light hover:bg-white/50 hover:text-text"
        >
          All applicants
        </Link>
      </div>

      {/* Desktop: ranked list + slide-in candidate panel */}
      <section className="mt-6 hidden rounded-card border border-border bg-white/60 p-5 md:block">
        <div className="mb-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-text">Interview first</h2>
            <p className="text-sm text-text-light">Your priority queue for this role</p>
          </div>
        </div>
        <ShortlistBoard entries={clientEntries} passed={clientPassed} />
      </section>

      {/* Mobile: one card at a time */}
      <section className="mt-5 md:hidden">
        <MobileReview jobId={id} jobs={jobs} entries={clientEntries} progress={progress} />
      </section>
    </div>
  );
}
