import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import Link from 'next/link';
import type { ApplicationStatus } from '@/lib/types';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const styles: Record<ApplicationStatus, string> = {
    applied: 'bg-blue-100 text-blue-700',
    shortlisted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    hired: 'bg-purple-100 text-purple-700',
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
}: {
  applicationId: string;
  status: ApplicationStatus;
  currentStatus: ApplicationStatus;
}) {
  if (currentStatus === status) return null;

  const styles: Record<string, string> = {
    shortlisted:
      'border-green-300 text-green-700 hover:bg-green-50',
    rejected: 'border-red-300 text-red-700 hover:bg-red-50',
    hired: 'border-purple-300 text-purple-700 hover:bg-purple-50',
  };

  const labels: Record<string, string> = {
    shortlisted: 'Shortlist',
    rejected: 'Reject',
    hired: 'Hire',
  };

  async function updateStatus() {
    'use server';
    const supabase = await createClient();
    const user = await requireAuth();

    // Verify ownership
    const { data: application } = await supabase
      .from('applications')
      .select('id, job_id')
      .eq('id', applicationId)
      .single();

    if (!application) return;

    const { data: listing } = await supabase
      .from('job_listings')
      .select('company_id')
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

    redirect(`/my-listings/${application.job_id}/applicants`);
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  const { data: applications } = await supabase
    .from('applications')
    .select(
      `
      id,
      status,
      applied_at,
      cover_letter_text,
      seeker_profiles!applications_seeker_id_fkey (
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
    .eq('job_id', id)
    .order('applied_at', { ascending: false });

  const applicants = (applications ?? []) as unknown as ApplicantData[];

  // Count by status
  const counts = applicants.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      {/* Header */}
      <Link
        href="/my-listings"
        className="inline-flex items-center gap-1 text-sm text-text-light hover:text-primary transition-colors"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to My Listings
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-primary sm:text-3xl">
        Applicants
      </h1>
      <p className="mt-1 text-sm text-text-light">
        for <span className="font-medium text-text">{listing.title}</span>
      </p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', count: applicants.length, color: 'bg-gray-100 text-gray-700' },
          { label: 'Shortlisted', count: counts.shortlisted ?? 0, color: 'bg-green-100 text-green-700' },
          { label: 'Hired', count: counts.hired ?? 0, color: 'bg-purple-100 text-purple-700' },
          { label: 'Rejected', count: counts.rejected ?? 0, color: 'bg-red-100 text-red-700' },
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

      {/* Applicant List */}
      {applicants.length === 0 ? (
        <div className="mt-12 text-center">
          <svg
            className="mx-auto h-16 w-16 text-gray-300"
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
            No applicants yet
          </h3>
          <p className="mt-1 text-sm text-text-light">
            When job seekers apply, they will appear here.
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
                className="group rounded-xl border border-border bg-white transition-shadow hover:shadow-sm"
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

                  {/* CV Download */}
                  {seeker?.cv_url && (
                    <a
                      href={seeker.cv_url}
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

                  {/* Status Actions */}
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                    <span className="mr-2 text-xs font-medium text-text-light self-center">
                      Set status:
                    </span>
                    <StatusButton
                      applicationId={app.id}
                      status="shortlisted"
                      currentStatus={app.status}
                    />
                    <StatusButton
                      applicationId={app.id}
                      status="hired"
                      currentStatus={app.status}
                    />
                    <StatusButton
                      applicationId={app.id}
                      status="rejected"
                      currentStatus={app.status}
                    />
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
