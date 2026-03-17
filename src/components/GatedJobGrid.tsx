"use client";

import Link from "next/link";
import JobCard, { type Job } from "@/components/JobCard";

interface GatedJobGridProps {
  jobs: Job[];
  isLoggedIn: boolean;
}

export default function GatedJobGrid({ jobs, isLoggedIn }: GatedJobGridProps) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-[--radius-card] border border-border bg-white dark:bg-surface p-10 text-center">
        <p className="text-text-light">No jobs posted yet. Check back soon!</p>
      </div>
    );
  }

  // Logged-in users see everything
  if (isLoggedIn) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    );
  }

  // Not logged in: show first 2, blur the rest
  const visible = jobs.slice(0, 2);
  const blurred = jobs.slice(2);

  return (
    <div className="relative">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
        {visible.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}

        {blurred.map((job) => (
          <div key={job.id} className="select-none pointer-events-none blur-[6px] opacity-60" aria-hidden>
            <JobCard job={job} />
          </div>
        ))}
      </div>

      {/* Overlay CTA */}
      {blurred.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-72 flex items-end justify-center pb-8 bg-gradient-to-t from-bg-alt via-bg-alt/95 to-transparent">
          <div className="text-center max-w-md px-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-4">
              <svg className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="text-lg font-display font-semibold text-text">
              Create an account to see all opportunities
            </h3>
            <p className="mt-1.5 text-sm text-text-light">
              Sign up for free and get full access to every listing, save jobs, and apply instantly.
            </p>
            <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors shadow-sm"
              >
                Create Free Account
              </Link>
              <Link
                href="/login"
                className="text-sm font-medium text-primary hover:text-primary-dark transition-colors"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
