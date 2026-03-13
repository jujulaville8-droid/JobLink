"use client";

import Link from "next/link";

type ApplyState = "apply" | "login" | "not-seeker" | "applied" | "closed" | "profile-incomplete";

interface ApplyButtonProps {
  jobId: string;
  state: ApplyState;
}

export default function ApplyButton({ jobId, state }: ApplyButtonProps) {
  if (state === "closed") {
    return (
      <span className="flex w-full items-center justify-center rounded-[--radius-button] bg-gray-100 px-5 py-3 text-base font-semibold text-text-muted cursor-not-allowed">
        Applications Closed
      </span>
    );
  }

  if (state === "applied") {
    return (
      <span className="flex w-full items-center justify-center rounded-[--radius-button] bg-primary/10 px-5 py-3 text-base font-semibold text-primary">
        <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        Already Applied
      </span>
    );
  }

  if (state === "profile-incomplete") {
    return (
      <Link
        href={`/profile?returnTo=/jobs/${jobId}/apply`}
        className="flex w-full items-center justify-center rounded-[--radius-button] bg-amber-500 hover:bg-amber-600 px-5 py-3 text-base font-semibold text-white transition-colors"
      >
        Complete Profile to Apply
      </Link>
    );
  }

  if (state === "not-seeker") {
    return (
      <span className="flex w-full items-center justify-center rounded-[--radius-button] bg-gray-100 px-5 py-3 text-base font-semibold text-text-muted cursor-not-allowed">
        Switch to Seeker to Apply
      </span>
    );
  }

  if (state === "login") {
    return (
      <Link
        href={`/login?returnTo=/jobs/${jobId}/apply`}
        className="flex w-full items-center justify-center btn-warm text-base"
      >
        Sign In to Apply
      </Link>
    );
  }

  // state === "apply"
  return (
    <Link
      href={`/jobs/${jobId}/apply`}
      className="flex w-full items-center justify-center btn-warm text-base"
    >
      Apply Now
    </Link>
  );
}
