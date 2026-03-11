"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import JobLinkLogo from "@/components/JobLinkLogo";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, avatarUrl, logout, isLoading } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initial = user?.email?.charAt(0).toUpperCase() ?? "U";
  const showAvatar = avatarUrl && !imgError;

  // Reset error when avatar URL changes (e.g. user uploads new photo)
  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const navLinks = [
    { href: "/jobs", label: "Find Jobs" },
    { href: "/about", label: "About" },
    ...(isAuthenticated ? [{ href: "/dashboard", label: "Dashboard" }] : []),
  ];

  // Close menus on route change
  useEffect(() => {
    setProfileOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  function navigateTo(href: string) {
    setProfileOpen(false);
    router.push(href);
  }

  function isActive(href: string) {
    if (href === "/jobs") return pathname.startsWith("/jobs");
    return pathname === href;
  }

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-[#e7e5e0]/60">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <JobLinkLogo size={28} />
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
              Job<span className="text-[#0d7377]">Link</span>
            </span>
          </Link>

          {/* Center nav — desktop */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                  isActive(link.href)
                    ? "text-[#0d7377]"
                    : "text-[#71717a] hover:text-[#0d7377] hover:bg-[#0d7377]/[0.04]"
                }`}
              >
                {link.label}
                {isActive(link.href) && (
                  <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-[#0d7377] rounded-full" />
                )}
              </Link>
            ))}
          </div>

          {/* Right side — desktop */}
          <div className="hidden md:flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-20" />
            ) : isAuthenticated ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 rounded-full border border-[#e7e5e0] p-1.5 pr-3.5 hover:bg-[#faf9f7] hover:border-[#d4d2cd] transition-all"
                >
                  {showAvatar ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0d7377] text-white text-[13px] font-semibold">
                      {initial}
                    </span>
                  )}
                  <svg
                    className={`h-3.5 w-3.5 text-[#a1a1aa] transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[#e7e5e0] bg-white py-1.5 shadow-lg shadow-black/[0.08] z-50 overflow-hidden">
                    <div className="px-4 py-2 border-b border-[#e7e5e0]/60 mb-1">
                      <p className="text-xs text-[#a1a1aa] truncate">{user?.email}</p>
                    </div>
                    <button onClick={() => navigateTo("/dashboard")} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#faf9f7] transition-colors">
                      <svg className="h-4 w-4 text-[#a1a1aa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                      Dashboard
                    </button>
                    <button onClick={() => navigateTo("/profile")} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#faf9f7] transition-colors">
                      <svg className="h-4 w-4 text-[#a1a1aa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      Profile
                    </button>
                    <button onClick={() => navigateTo("/settings")} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#1a1a1a] hover:bg-[#faf9f7] transition-colors">
                      <svg className="h-4 w-4 text-[#a1a1aa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                      Settings
                    </button>
                    <hr className="my-1.5 border-[#e7e5e0]/60" />
                    <button
                      onClick={() => { setProfileOpen(false); logout(); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-[#71717a] hover:text-[#0d7377] transition-colors px-3 py-2"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#0d7377] hover:bg-[#095355] px-6 py-2.5 text-sm font-semibold text-white transition-all shadow-sm shadow-[#0d7377]/20 hover:shadow-md hover:shadow-[#0d7377]/25"
                >
                  Post a Job
                </Link>
              </>
            )}
          </div>

          {/* Mobile right side */}
          <div className="flex md:hidden items-center gap-2">
            {isAuthenticated && (
              <Link href="/dashboard" className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden">
                {showAvatar ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0d7377] text-white text-[13px] font-semibold">
                    {initial}
                  </span>
                )}
              </Link>
            )}
            {/* Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#faf9f7] transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="h-5 w-5 text-[#1a1a1a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              ) : (
                <svg className="h-5 w-5 text-[#1a1a1a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#e7e5e0]/60 py-3 pb-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive(link.href)
                    ? "text-[#0d7377] bg-[#0d7377]/[0.04]"
                    : "text-[#71717a] hover:text-[#0d7377] hover:bg-[#0d7377]/[0.04]"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {!isAuthenticated && !isLoading && (
              <div className="mt-3 pt-3 border-t border-[#e7e5e0]/60 flex gap-2 px-3">
                <Link href="/login" className="flex-1 text-center text-sm font-medium text-[#71717a] border border-[#e7e5e0] rounded-full py-2.5 hover:bg-[#faf9f7] transition-colors">
                  Sign In
                </Link>
                <Link href="/signup" className="flex-1 text-center text-sm font-semibold text-white bg-[#0d7377] rounded-full py-2.5 hover:bg-[#095355] transition-colors">
                  Post a Job
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
