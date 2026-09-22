"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useNavigationFeedback } from "@/components/useNavigationFeedback";
import { getActiveHref } from "@/lib/navigation-state";

// Only hide the bottom nav when actively posting a job
const HIDDEN_PREFIXES = ["/post-job"];

export default function BottomNav() {
  const { isAuthenticated, userRole } = useAuth();
  const pathname = usePathname();
  const isHidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  const {
    activePathname,
    beginNavigation,
    isPending,
    prefetch,
  } = useNavigationFeedback();
  const visiblePaths = [
    "/",
    "/jobs",
    ...(isAuthenticated && userRole === "employer" ? ["/post-job"] : []),
    ...(isAuthenticated ? ["/messages"] : []),
    "/profile/cv",
    ...(isAuthenticated ? ["/profile", "/dashboard"] : ["/login"]),
  ];
  const activeHref = getActiveHref(activePathname, visiblePaths);
  const isActive = (path: string) => activeHref === path;

  if (isHidden) return null;

  const linkClass = (path: string) =>
    `dashboard-bottom-nav-link relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-[11px] font-medium ${
      isActive(path) ? "text-primary" : "text-text-muted"
    }`;

  const iconClass = (path: string) =>
    `h-5.5 w-5.5 ${isActive(path) ? "text-primary" : "text-text-muted"}`;

  const navigationProps = (path: string) => ({
    "aria-busy": isPending(path) || undefined,
    "aria-current": isActive(path) ? ("page" as const) : undefined,
    "data-pending": isPending(path) || undefined,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) =>
      beginNavigation(event, path),
    onFocus: () => prefetch(path),
    onMouseEnter: () => prefetch(path),
    onTouchStart: () => prefetch(path),
  });

  const activeDot = (path: string) => (
    <span
      aria-hidden="true"
      className="dashboard-nav-dot absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
    >
      {isPending(path) && <span className="sr-only">Loading</span>}
    </span>
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[--color-surface]/90 backdrop-blur-xl md:hidden">
      <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Link href="/" className={linkClass("/")} {...navigationProps("/")}>
          <svg className={iconClass("/")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Home</span>
          {isActive("/") && activeDot("/")}
        </Link>

        <Link href="/jobs" className={linkClass("/jobs")} {...navigationProps("/jobs")}>
          <svg className={iconClass("/jobs")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Jobs</span>
          {isActive("/jobs") && activeDot("/jobs")}
        </Link>

        {isAuthenticated && userRole === "employer" && (
          <Link href="/post-job" className={linkClass("/post-job")} {...navigationProps("/post-job")}>
            <svg className={iconClass("/post-job")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <span>Post</span>
            {isActive("/post-job") && activeDot("/post-job")}
          </Link>
        )}

        {isAuthenticated && (
          <Link href="/messages" className={linkClass("/messages")} {...navigationProps("/messages")}>
            <svg className={iconClass("/messages")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>{userRole === "employer" ? "Inbox" : "Messages"}</span>
            {isActive("/messages") && activeDot("/messages")}
          </Link>
        )}

        <Link href="/profile/cv" className={linkClass("/profile/cv")} {...navigationProps("/profile/cv")}>
          <svg className={iconClass("/profile/cv")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span>Resume</span>
          {isActive("/profile/cv") && activeDot("/profile/cv")}
        </Link>

        {isAuthenticated ? (
          <>
            <Link href="/profile" className={linkClass("/profile")} {...navigationProps("/profile")}>
              <svg className={iconClass("/profile")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Profile</span>
              {isActive("/profile") && activeDot("/profile")}
            </Link>
            <Link href="/dashboard" className={linkClass("/dashboard")} {...navigationProps("/dashboard")}>
              <svg className={iconClass("/dashboard")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Dashboard</span>
              {isActive("/dashboard") && activeDot("/dashboard")}
            </Link>
          </>
        ) : (
          <Link href="/login" className={linkClass("/login")} {...navigationProps("/login")}>
            <svg className={iconClass("/login")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Sign In</span>
            {isActive("/login") && activeDot("/login")}
          </Link>
        )}
      </div>
    </nav>
  );
}
