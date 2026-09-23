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
      <div className="rounded-[--radius-card] border border-border bg-white p-10 text-center">
        <p className="text-text-light">Jobs coming soon!</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} loggedIn={isLoggedIn} />
        ))}
      </div>

      {!isLoggedIn && (
        <div className="mt-6 rounded-2xl border border-primary/15 bg-white px-5 py-5 sm:px-7 sm:py-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="hidden sm:inline-flex shrink-0 items-center justify-center w-11 h-11 rounded-xl bg-primary/10">
                <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-text">
                  Ready to apply?
                </h3>
                <p className="mt-1 text-sm text-text-light">
                  Create a free profile to save jobs, apply faster, and track every application.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
              <Link
                href="/signup"
                className="rounded-xl bg-primary px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-dark transition-colors shadow-sm"
              >
                Create Free Profile
              </Link>
              <Link
                href="/login"
                className="text-center text-sm font-medium text-primary hover:text-primary-dark transition-colors"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
