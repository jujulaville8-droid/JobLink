"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

/**
 * Wraps auth pages (login, signup, forgot-password, etc.).
 *
 * Only redirects VERIFIED users away from auth pages → dashboard.
 * Does NOT redirect unverified users — the login/signup handlers manage
 * unverified state directly (sign out, show error, resend link).
 * This prevents a race condition where AuthRedirect fires before the
 * form handler finishes its verification check.
 */
export default function AuthRedirect({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isEmailVerified, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    // Only redirect if fully verified — don't interfere with login/signup handlers
    if (isAuthenticated && isEmailVerified) {
      window.location.href = "/dashboard";
    }
  }, [isAuthenticated, isEmailVerified, isLoading]);

  // While loading auth state, show spinner (avoids flash of login form)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-6 w-6 text-[#0d7377]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  // Verified user — show nothing while redirect happens
  if (isAuthenticated && isEmailVerified) {
    return null;
  }

  // Not authenticated, or authenticated but unverified — show the page
  return <>{children}</>;
}
