"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

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
        className="btn-warm"
      >
        Create Free Account
      </Link>
    </div>
  );
}

export function EmployerCTAs() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="mt-8 flex flex-col sm:flex-row gap-3">
      {!isLoading && isAuthenticated ? (
        <Link
          href="/dashboard"
          className="btn-warm"
        >
          Go to Dashboard
        </Link>
      ) : (
        <Link
          href="/signup"
          className="btn-warm"
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
