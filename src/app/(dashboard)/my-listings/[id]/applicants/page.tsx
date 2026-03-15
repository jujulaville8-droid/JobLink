import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import Link from 'next/link';
import type { ApplicationStatus } from '@/lib/types';
import MessageButton from '@/components/messaging/MessageButton';
import { sendStatusChangeMessage } from '@/lib/messaging-system-messages';
import HireButton from '@/components/HireButton';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const styles: Record<ApplicationStatus, string> = {
    applied: 'bg-primary/10 text-primary',
    shortlisted: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-red-50 text-red-600',
    hired: 'bg-accent-warm/10 text-amber-700',
  };
  const labels: Record<ApplicationStatus, string> = {
    applied: 'Applied',
    shortlisted: 'Shortlisted',
    rejected: 'Rejected',
    hired: 'Hired',
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function StatusButton({
  applicationId,
  status,
  currentStatus,
  jobId,
}: {
  applicationId: string;
  status: ApplicationStatus;
  currentStatus: ApplicationStatus;
  jobId: string;
}) {
  if (currentStatus === status) return null;

  const styles: Record<string, string> = {
    applied: 'border-gray-300 text-gray-600 hover:bg-gray-50',
    shortlisted:
      'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
    rejected: 'border-red-300 text-red-600 hover:bg-red-50',
    hired: 'border-amber-300 text-amber-700 hover:bg-amber-50',
  };

  const labels: Record<string, string> = {
    applied: 'Reset',
    shortlisted: 'Shortlist',
    rejected: 'Reject',
    hired: 'Hire',
  };

  async function updateStatus() {
    'use server';
    const supabase = await createClient();
    const user = await requireAuth();

    // Verify ownership and get context for system message
    const { data: application } = await supabase
      .from('applications')
      .select('id, job_id, seeker_id')
      .eq('id', applicationId)
      .single();

    if (!application) return;

    const { data: listing } = await supabase
      .from('job_listings')
      .select('company_id, title, companies(company_name)')
      .eq('id', application.job_id)
      .single();

    if (!listing) return;

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', listing.company_id)
      .single();

    if (!company) return;

    await supabase
      .from('applications')
      .update({ status })
      .eq('id', applicationId);

    // Send system message into the conversation thread (skip for reset to applied)
    if (status !== 'applied') {
      const { data: seekerProfile } = await supabase
        .from('seeker_profiles')
        .select('user_id')
        .eq('id', application.seeker_id)
        .single();

      if (seekerProfile?.user_id) {
        const companyData = Array.isArray(listing.companies) ? listing.companies[0] : listing.companies;
        await sendStatusChangeMessage(supabase, {
          applicationId,
          employerUserId: user.id,
          seekerUserId: seekerProfile.user_id,
          newStatus: status,
          jobTitle: listing.title,
          companyName: (companyData as { company_name: string } | null)?.company_name || 'the employer',
        });
      }
    }

    redirect(`/my-listings/${jobId}/applicants`);
  }

  return (
    <form action={updateStatus} className="inline">
      <button
        type="submit"
        className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${styles[status]}`}
      >
        {labels[status]}
      </button>
    </form>
  );
}

interface ApplicantData {
  id: string;
  status: ApplicationStatus;
  applied_at: string;
  cover_letter_text: string | null;
  seeker_profiles: {
    id: string;
    first_name: string;
    last_name: string;
    location: string;
    experience_years: number | null;
    skills: string[];
    bio: string | null;
    education: string | null;
    cv_url: string | null;
    phone: string | null;
  } | null;
}

export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  const { id } = await params;
  const { status: statusFilter, sort } = await searchParams;
  const user = await requireAuth();
  const supabase = await createClient();

  // Verify listing belongs to this employer
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

  // Fetch applications with seeker profiles
  let query = supabase
    .from('applications')
    .select(
      `
      id,
      status,
      applied_at,
      cover_letter_text,
      seeker_profiles!applications_seeker_id_fkey (
        id,
        first_name,
        last_name,
        location,
        experience_years,
        skills,
        bio,
        education,
        cv_url,
        phone
      )
    `
    )
    .eq('job_id', id);

  // Apply status filter
  if (statusFilter && ['applied', 'shortlisted', 'rejected', 'hired'].includes(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  // Apply sort
  if (sort === 'oldest') {
    query = query.order('applied_at', { ascending: true });
  } else {
    query = query.order('applied_at', { ascending: false });
  }

  const { data: applications } = await query;

  const applicants = (applications ?? []) as unknown as ApplicantData[];

  // Get unfiltered counts for the filter tabs
  const { data: allApplications } = await supabase
    .from('applications')
    .select('status')
    .eq('job_id', id);

  const allApplicants = allApplications ?? [];
  const counts = allApplicants.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const totalCount = allApplicants.length;

  const filterTabs = [
    { key: '', label: 'All', count: totalCount },
    { key: 'applied', label: 'Applied', count: counts.applied ?? 0 },
    { key: 'shortlisted', label: 'Shortlisted', count: counts.shortlisted ?? 0 },
    { key: 'hired', label: 'Hired', count: counts.hired ?? 0 },
    { key: 'rejected', label: 'Rejected', count: counts.rejected ?? 0 },
  ];

  function buildFilterUrl(newStatus: string, newSort?: string) {
    const p = new URLSearchParams();
    if (newStatus) p.set('status', newStatus);
    if (newSort || sort) p.set('sort', newSort || sort || 'newest');
    const qs = p.toString();
    return `/my-listings/${id}/applicants${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      {/* Header */}
      <Link
        href="/my-listings"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-text transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0"
      >
        <svg
          className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to My Listings
      </Link>

      <h1 className="mt-4 text-2xl font-bold font-display text-primary sm:text-3xl">
        Applicants
      </h1>
      <p className="mt-1 text-sm text-text-light">
        for <span className="font-medium text-text">{listing.title}</span>
      </p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', count: totalCount, color: 'bg-bg-alt text-text-light' },
          { label: 'Shortlisted', count: counts.shortlisted ?? 0, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Hired', count: counts.hired ?? 0, color: 'bg-accent-warm/10 text-amber-700' },
          { label: 'Rejected', count: counts.rejected ?? 0, color: 'bg-red-50 text-red-600' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-white p-3 text-center"
          >
            <p className="text-2xl font-bold text-text">{stat.count}</p>
            <p className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${stat.color}`}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Filter & Sort Controls */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status filter tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-bg-alt p-1">
          {filterTabs.map((tab) => (
            <Link
              key={tab.key}
              href={buildFilterUrl(tab.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                (statusFilter || '') === tab.key
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-text-light hover:text-text hover:bg-white/50'
              }`}
            >
              {tab.label}
              <span className="ml-1 text-text-muted">({tab.count})</span>
            </Link>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Sort:</span>
          <Link
            href={buildFilterUrl(statusFilter || '', 'newest')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              sort !== 'oldest' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text'
            }`}
          >
            Newest
          </Link>
          <Link
            href={buildFilterUrl(statusFilter || '', 'oldest')}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              sort === 'oldest' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text'
            }`}
          >
            Oldest
          </Link>
        </div>
      </div>

      {/* Applicant List */}
      {applicants.length === 0 ? (
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
              d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
            />
            <circle cx="9" cy="7" r="4" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-text">
            {statusFilter ? 'No matching applicants' : 'No applicants yet'}
          </h3>
          <p className="mt-1 text-sm text-text-light">
            {statusFilter
              ? 'Try a different filter to see other applicants.'
              : 'When job seekers apply, they will appear here.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {applicants.map((app) => {
            const seeker = app.seeker_profiles;
            const name = seeker
              ? `${seeker.first_name} ${seeker.last_name}`
              : 'Unknown Applicant';

            return (
              <details
                key={app.id}
                className="group rounded-[--radius-card] border border-border bg-white transition-shadow hover:shadow-sm"
              >
                <summary className="cursor-pointer list-none p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                        {seeker
                          ? `${seeker.first_name.charAt(0)}${seeker.last_name.charAt(0)}`
                          : '?'}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-text">
                            {name}
                          </h3>
                          <StatusBadge status={app.status} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-light">
                          {seeker?.location && (
                            <span>{seeker.location}</span>
                          )}
                          {seeker?.experience_years != null && (
                            <span>
                              {seeker.experience_years} yr
                              {seeker.experience_years !== 1 ? 's' : ''}{' '}
                              experience
                            </span>
                          )}
                          <span>Applied {formatDate(app.applied_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <svg
                        className="h-5 w-5 text-text-light transition-transform group-open:rotate-180"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </div>

                  {/* Skills tags */}
                  {seeker?.skills && seeker.skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {seeker.skills.slice(0, 6).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {skill}
                        </span>
                      ))}
                      {seeker.skills.length > 6 && (
                        <span className="text-xs text-text-light">
                          +{seeker.skills.length - 6} more
                        </span>
                      )}
                    </div>
                  )}
                </summary>

                {/* Expanded details */}
                <div className="border-t border-border px-5 pb-5 pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {seeker?.bio && (
                      <div className="sm:col-span-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-light">
                          Bio
                        </h4>
                        <p className="mt-1 text-sm text-text">
                          {seeker.bio}
                        </p>
                      </div>
                    )}

                    {seeker?.education && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-light">
                          Education
                        </h4>
                        <p className="mt-1 text-sm text-text">
                          {seeker.education}
                        </p>
                      </div>
                    )}

                    {seeker?.phone && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-light">
                          Phone
                        </h4>
                        <p className="mt-1 text-sm text-text">
                          {seeker.phone}
                        </p>
                      </div>
                    )}

                    {app.cover_letter_text && (
                      <div className="sm:col-span-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-light">
                          Cover Letter
                        </h4>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-text">
                          {app.cover_letter_text}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* CV Download — route through secure API endpoint */}
                  {seeker?.cv_url && seeker?.id && (
                    <a
                      href={`/api/cv-download?profileId=${seeker.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-white"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download CV
                    </a>
                  )}

                  {/* Message + Status Actions */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <MessageButton
                      applicationId={app.id}
                      label="Message Candidate"
                      variant="primary"
                    />
                    <span className="mx-1 text-border">|</span>
                    <span className="mr-2 text-xs font-medium text-text-light self-center">
                      Set status:
                    </span>
                    {app.status !== 'applied' && (
                      <StatusButton
                        applicationId={app.id}
                        status="applied"
                        currentStatus={app.status}
                        jobId={id}
                      />
                    )}
                    <StatusButton
                      applicationId={app.id}
                      status="shortlisted"
                      currentStatus={app.status}
                      jobId={id}
                    />
                    {app.status !== 'hired' && (
                      <HireButton
                        applicationId={app.id}
                        jobId={id}
                      />
                    )}
                    <StatusButton
                      applicationId={app.id}
                      status="rejected"
                      currentStatus={app.status}
                      jobId={id}
                    />
                    <span className="ml-1 text-[10px] text-text-muted self-center italic">
                      The applicant will be notified
                    </span>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
