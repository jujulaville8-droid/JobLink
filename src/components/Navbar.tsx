"use client";

import Link from "next/link";
import { useState } from "react";

interface NavbarProps {
  isLoggedIn?: boolean;
  userRole?: "jobseeker" | "employer";
}

export default function Navbar({ isLoggedIn = false, userRole }: NavbarProps) {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <svg
              className="h-8 w-8 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              <line x1="12" y1="12" x2="12" y2="16" />
              <line x1="10" y1="14" x2="14" y2="14" />
            </svg>
            <span className="text-xl font-bold text-primary">JobLink</span>
          </Link>

          {/* Center nav links — hidden on mobile */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/jobs"
              className="text-sm font-medium text-text-light hover:text-primary transition-colors"
            >
              Find Jobs
            </Link>
            <Link
              href="/employers"
              className="text-sm font-medium text-text-light hover:text-primary transition-colors"
            >
              For Employers
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-text-light hover:text-primary transition-colors"
            >
              About
            </Link>
            {isLoggedIn && (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-text-light hover:text-primary transition-colors"
              >
                Dashboard
              </Link>
            )}
          </div>

          {/* Right side auth / profile */}
          <div className="hidden md:flex items-center gap-4">
            {isLoggedIn ? (
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 rounded-full border border-border p-1 pr-3 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-sm font-medium">
                    U
                  </span>
                  <svg
                    className={`h-4 w-4 text-text-light transition-transform ${profileOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-white py-1 shadow-lg">
                    <Link
                      href="/dashboard"
                      className="block px-4 py-2 text-sm text-text hover:bg-gray-50"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-sm text-text hover:bg-gray-50"
                    >
                      Profile
                    </Link>
                    <Link
                      href="/settings"
                      className="block px-4 py-2 text-sm text-text hover:bg-gray-50"
                    >
                      Settings
                    </Link>
                    <hr className="my-1 border-border" />
                    <button className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50">
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="text-sm font-medium text-text-light hover:text-primary transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/post-job"
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                >
                  Post a Job
                </Link>
              </>
            )}
          </div>

          {/* Mobile: Post a Job button (nav links handled by BottomNav) */}
          <div className="flex md:hidden items-center gap-3">
            {!isLoggedIn && (
              <Link
                href="/post-job"
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                Post a Job
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
