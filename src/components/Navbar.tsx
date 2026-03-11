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
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#e7e5e0]/80">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[60px] items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="JobLink" width={32} height={32} className="h-8 w-8" />
            <span className="text-lg font-bold text-[#1a1a1a]">JobLink</span>
          </Link>

          {/* Center nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/jobs" className="text-[13px] font-medium text-[#71717a] hover:text-[#1a1a1a] transition-colors">
              Find Jobs
            </Link>
            <Link href="/about" className="text-[13px] font-medium text-[#71717a] hover:text-[#1a1a1a] transition-colors">
              About
            </Link>
            {isLoggedIn && (
              <Link href="/dashboard" className="text-[13px] font-medium text-[#71717a] hover:text-[#1a1a1a] transition-colors">
                Dashboard
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-2">
            {isLoggedIn ? (
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 rounded-full border border-[#e7e5e0] p-1 pr-3 hover:bg-[#faf9f7] transition-colors"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0d7377] text-white text-xs font-medium">
                    U
                  </span>
                  <svg
                    className={`h-3.5 w-3.5 text-[#a1a1aa] transition-transform ${profileOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[#e7e5e0] bg-white py-1 shadow-lg shadow-black/5">
                    <Link href="/dashboard" className="block px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#faf9f7]">Dashboard</Link>
                    <Link href="/profile" className="block px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#faf9f7]">Profile</Link>
                    <Link href="/settings" className="block px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#faf9f7]">Settings</Link>
                    <hr className="my-1 border-[#e7e5e0]" />
                    <button className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-[#faf9f7]">Sign Out</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-[13px] font-medium text-[#71717a] hover:text-[#1a1a1a] transition-colors px-3 py-2"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#0d7377] hover:bg-[#095355] px-5 py-2 text-[13px] font-semibold text-white transition-colors"
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
                className="rounded-full bg-[#0d7377] hover:bg-[#095355] px-4 py-2 text-[13px] font-semibold text-white transition-colors"
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
