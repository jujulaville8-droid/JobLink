"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

/**
 * Hero CTA buttons — auth-aware.
 * Logged out: "Browse All Jobs" + "Post a Job — Free" (→ /signup)
 * Logged in:  "Browse All Jobs" + "Go to Dashboard"
 */
export function HeroCTAs() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
      <Link
        href="/jobs"
        className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-white text-[#1a1a1a] font-semibold px-8 py-3.5 text-[15px] hover:bg-white/90 transition-all shadow-lg shadow-black/15"
      >
        Browse All Jobs
      </Link>
      {!isLoading && isAuthenticated ? (
        <Link
          href="/dashboard"
          className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-white/25 text-white font-semibold px-8 py-3.5 text-[15px] hover:bg-white/10 backdrop-blur-sm transition-all"
        >
          Go to Dashboard
        </Link>
      ) : (
        <Link
          href="/signup"
          className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-white/25 text-white font-semibold px-8 py-3.5 text-[15px] hover:bg-white/10 backdrop-blur-sm transition-all"
        >
          Post a Job — Free
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
          className="inline-flex items-center justify-center rounded-full bg-[#0d7377] hover:bg-[#095355] text-white font-semibold px-7 py-3 text-sm transition-colors"
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
        className="inline-flex items-center justify-center rounded-full bg-[#0d7377] hover:bg-[#095355] text-white font-semibold px-7 py-3 text-sm transition-colors"
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
          className="inline-flex items-center justify-center rounded-full bg-white text-[#0d7377] font-semibold px-7 py-3 text-sm hover:bg-white/90 transition-colors"
        >
          Go to Dashboard
        </Link>
      ) : (
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-full bg-white text-[#0d7377] font-semibold px-7 py-3 text-sm hover:bg-white/90 transition-colors"
        >
          Post a Job — Free
        </Link>
      )}
      <Link
        href="/about"
        className="inline-flex items-center justify-center rounded-full border border-white/30 text-white font-semibold px-7 py-3 text-sm hover:bg-white/10 transition-colors"
      >
        Learn More
      </Link>
    </div>
  );
}
