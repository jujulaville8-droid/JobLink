"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export function HeroCTAs() {
  const { isAuthenticated, userRole, isLoading } = useAuth();

  return (
    <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
      {!isLoading && isAuthenticated && userRole === "employer" ? (
        <>
          <Link
            href="/browse-candidates"
            className="btn-primary w-full sm:w-auto shadow-lg shadow-black/20"
          >
            Browse Candidates
          </Link>
          <Link
            href="/dashboard"
            className="btn-secondary w-full sm:w-auto"
          >
            Employer Dashboard
          </Link>
        </>
      ) : (
        <>
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
              href="/employer/signup"
              className="btn-secondary w-full sm:w-auto"
            >
              Post a Job
            </Link>
          )}
        </>
      )}
    </div>
  );
}

export function GetStartedCTA() {
  const { isAuthenticated, userRole, isLoading } = useAuth();

  if (!isLoading && isAuthenticated) {
    return (
      <div className="mt-10">
        <Link
          href="/dashboard"
          className="btn-primary"
        >
          {userRole === "employer" ? "Employer Dashboard" : "Go to Dashboard"}
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
  const { isAuthenticated, userRole, isLoading } = useAuth();

  return (
    <div className="mt-8 flex flex-col sm:flex-row gap-3">
      {!isLoading && isAuthenticated ? (
        userRole === "employer" ? (
          <Link
            href="/post-job"
            className="btn-warm"
          >
            Post a Job
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="btn-warm"
          >
            Go to Dashboard
          </Link>
        )
      ) : (
        <Link
          href="/employer/signup"
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
