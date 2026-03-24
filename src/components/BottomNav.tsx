"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

// Only hide the bottom nav when actively posting a job
const HIDDEN_PREFIXES = ["/post-job"];

export default function BottomNav() {
  const { isAuthenticated, userRole } = useAuth();
  const pathname = usePathname();
  const isHidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  const isActive = (path: string) => pathname === path;

  if (isHidden) return null;

  const linkClass = (path: string) =>
    `flex flex-col items-center gap-0.5 text-[11px] font-medium py-1 min-w-[56px] relative ${
      isActive(path) ? "text-primary" : "text-text-muted"
    }`;

  const iconClass = (path: string) =>
    `h-5.5 w-5.5 ${isActive(path) ? "text-primary" : "text-text-muted"}`;

  const activeDot = (
    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[--color-surface]/90 backdrop-blur-xl md:hidden">
      <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Link href="/" className={linkClass("/")}>
          <svg className={iconClass("/")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Home</span>
          {isActive("/") && activeDot}
        </Link>

        <Link href="/jobs" className={linkClass("/jobs")}>
          <svg className={iconClass("/jobs")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Jobs</span>
          {isActive("/jobs") && activeDot}
        </Link>

        {isAuthenticated && userRole === "employer" && (
          <Link href="/post-job" className={linkClass("/post-job")}>
            <svg className={iconClass("/post-job")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <span>Post</span>
            {isActive("/post-job") && activeDot}
          </Link>
        )}

        {isAuthenticated && (
          <Link href="/messages" className={linkClass("/messages")}>
            <svg className={iconClass("/messages")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>{userRole === "employer" ? "Inbox" : "Messages"}</span>
            {isActive("/messages") && activeDot}
          </Link>
        )}

        <Link href="/profile/cv" className={linkClass("/profile/cv")}>
          <svg className={iconClass("/profile/cv")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span>Resume</span>
          {isActive("/profile/cv") && activeDot}
        </Link>

        {isAuthenticated ? (
          <>
            <Link href="/profile" className={linkClass("/profile")}>
              <svg className={iconClass("/profile")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Profile</span>
              {isActive("/profile") && activeDot}
            </Link>
            <Link href="/dashboard" className={linkClass("/dashboard")}>
              <svg className={iconClass("/dashboard")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Dashboard</span>
              {isActive("/dashboard") && activeDot}
            </Link>
          </>
        ) : (
          <Link href="/login" className={linkClass("/login")}>
            <svg className={iconClass("/login")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Sign In</span>
            {isActive("/login") && activeDot}
          </Link>
        )}
      </div>
    </nav>
  );
}
