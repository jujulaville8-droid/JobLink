"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

interface NavbarProps {
  isLoggedIn?: boolean;
  userRole?: "jobseeker" | "employer";
}

export default function Navbar({ isLoggedIn = false, userRole }: NavbarProps) {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#fffcf8]/95 backdrop-blur-sm border-b border-[#e8e2d9]">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="JobLink" width={38} height={38} className="h-9 w-9" />
            <span className="text-xl font-bold text-[#0d7377]">JobLink</span>
          </Link>

          {/* Center nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/jobs"
              className="text-sm font-medium text-[#7a7a72] hover:text-[#0d7377] transition-colors"
            >
              Find Jobs
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-[#7a7a72] hover:text-[#0d7377] transition-colors"
            >
              About
            </Link>
            {isLoggedIn && (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-[#7a7a72] hover:text-[#0d7377] transition-colors"
              >
                Dashboard
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {isLoggedIn ? (
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 rounded-full border border-[#e8e2d9] p-1 pr-3 hover:bg-[#f5ede3] transition-colors"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0d7377] text-white text-sm font-medium">
                    U
                  </span>
                  <svg
                    className={`h-4 w-4 text-[#7a7a72] transition-transform ${profileOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[#e8e2d9] bg-white py-1 shadow-lg">
                    <Link href="/dashboard" className="block px-4 py-2.5 text-sm text-[#2c2c2c] hover:bg-[#f5ede3]">
                      Dashboard
                    </Link>
                    <Link href="/profile" className="block px-4 py-2.5 text-sm text-[#2c2c2c] hover:bg-[#f5ede3]">
                      Profile
                    </Link>
                    <Link href="/settings" className="block px-4 py-2.5 text-sm text-[#2c2c2c] hover:bg-[#f5ede3]">
                      Settings
                    </Link>
                    <hr className="my-1 border-[#e8e2d9]" />
                    <button className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-[#f5ede3]">
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-semibold text-[#7a7a72] hover:text-[#0d7377] transition-colors px-3 py-2"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-[#e8613d] hover:bg-[#d4532f] px-5 py-2.5 text-sm font-semibold text-white transition-colors"
                >
                  Post a Job
                </Link>
              </>
            )}
          </div>

          {/* Mobile */}
          <div className="flex md:hidden items-center gap-3">
            {!isLoggedIn && (
              <Link
                href="/signup"
                className="rounded-lg bg-[#e8613d] hover:bg-[#d4532f] px-4 py-2 text-sm font-semibold text-white transition-colors"
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
