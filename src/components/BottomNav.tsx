"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
  isLoggedIn?: boolean;
  userRole?: "jobseeker" | "employer";
}

export default function BottomNav({
  isLoggedIn = false,
  userRole,
}: BottomNavProps) {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  const linkClass = (path: string) =>
    `flex flex-col items-center gap-0.5 text-[11px] font-medium py-1 min-w-[56px] ${
      isActive(path) ? "text-[#0d7377]" : "text-[#a09888]"
    }`;

  const iconClass = (path: string) =>
    `h-6 w-6 ${isActive(path) ? "text-[#0d7377]" : "text-[#a09888]"}`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e8e2d9] bg-[#fffcf8]/95 backdrop-blur-sm md:hidden">
      <div className="flex items-center justify-around py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Link href="/" className={linkClass("/")}>
          <svg className={iconClass("/")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Home</span>
        </Link>

        <Link href="/jobs" className={linkClass("/jobs")}>
          <svg className={iconClass("/jobs")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Jobs</span>
        </Link>

        {isLoggedIn && userRole === "employer" && (
          <Link href="/post-job" className={linkClass("/post-job")}>
            <svg className={iconClass("/post-job")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <span>Post</span>
          </Link>
        )}

        <Link href="/saved" className={linkClass("/saved")}>
          <svg className={iconClass("/saved")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span>Saved</span>
        </Link>

        <Link href="/profile" className={linkClass("/profile")}>
          <svg className={iconClass("/profile")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>Profile</span>
        </Link>
      </div>
    </nav>
  );
}
