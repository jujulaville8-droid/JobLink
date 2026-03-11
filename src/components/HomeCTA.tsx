"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

/**
 * Hero CTA buttons — auth-aware.
 * Logged out: "Browse All Jobs" + "Post a Job" (→ /signup)
 * Logged in:  "Browse All Jobs" + "Go to Dashboard"
 */
export function HeroCTAs() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
      <Link
        href="/jobs"
        className="btn-primary w-full sm:w-auto shadow-lg shadow-black/20"
      >
        Browse Jobs
      </Link>
      {!isLoading && isAuthenticated ? (
        <Link
          href="/dashboard"
          className="btn-secondary w-full sm:w-auto"
        >
          Go to Dashboard
        </Link>
      ) : (
        <Link
          href="/signup"
          className="btn-secondary w-full sm:w-auto"
        >
          Post a Job
        </Link>
      )}
    </div>
  );
}

/**
 * "Create Free Account" CTA in the How It Works section.
 * Logged in: shows "Go to Dashboard" instead.
 */
export function GetStartedCTA() {
  const { isAuthenticated, isLoading } = useAuth();

  if (!isLoading && isAuthenticated) {
    return (
      <div className="mt-10">
        <Link
          href="/dashboard"
          className="btn-primary"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <Link
        href="/signup"
        className="btn-primary"
      >
        Create Free Account
      </Link>
    </div>
  );
}

/**
 * Employer CTA section buttons.
 * Logged in: "Go to Dashboard" instead of "Post a Job — Free"
 */
export function EmployerCTAs() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="mt-8 flex flex-col sm:flex-row gap-3">
      {!isLoading && isAuthenticated ? (
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-[10px] bg-white text-[#0d7377] font-semibold px-7 py-3 text-[15px] hover:bg-white/90 transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-black/10"
        >
          Go to Dashboard
        </Link>
      ) : (
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-[10px] bg-white text-[#0d7377] font-semibold px-7 py-3 text-[15px] hover:bg-white/90 transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-black/10"
        >
          Post a Job — Free
        </Link>
      )}
      <Link
        href="/about"
        className="btn-secondary"
      >
        Learn More
      </Link>
    </div>
  );
}
