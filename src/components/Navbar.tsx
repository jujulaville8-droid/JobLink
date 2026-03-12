"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { LayoutGrid, User, Settings, LogOut } from "lucide-react";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, avatarUrl, logout, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const initial = user?.email?.charAt(0).toUpperCase() ?? "U";
  const showAvatar = avatarUrl && !imgError;

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
    setMobileMenuOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/jobs") return pathname.startsWith("/jobs") || pathname.startsWith("/browse-jobs");
    if (href === "/dashboard") return pathname.startsWith("/dashboard");
    return pathname === href;
  }

  // Avatar element reused in desktop
  const avatarElement = (
    <>
      {showAvatar ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-10 w-10 rounded-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white text-sm font-semibold">
          {initial}
        </span>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-border">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <div className="relative flex h-24 sm:h-28 items-center justify-between">

          {/* ── Left: Logo ── */}
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/company-logo.png"
              alt="JobLink — Antigua's Career Network"
              width={200}
              height={200}
              className="h-16 w-auto sm:h-20 -my-2"
              priority
            />
          </Link>

          {/* ── Center: Nav links (desktop) — absolutely centered ── */}
          <nav className="hidden md:flex items-center gap-1 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-4 py-2 text-[15px] font-medium rounded-lg transition-colors ${
                  isActive(link.href)
                    ? "text-primary"
                    : "text-text-light hover:text-primary hover:bg-bg-alt link-animated"
                }`}
              >
                {link.label}
                {isActive(link.href) && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-primary rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          {/* ── Right: Account area (desktop) ── */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {isLoading ? (
              <div className="h-9 w-9" />
            ) : isAuthenticated ? (
              <DropdownMenu
                header={
                  <p className="text-[13px] font-medium text-text truncate">{user?.email}</p>
                }
                dividerAfter={[2]}
                options={[
                  {
                    label: "Dashboard",
                    onClick: () => router.push("/dashboard"),
                    Icon: <LayoutGrid className="h-4 w-4 text-text-muted" />,
                  },
                  {
                    label: "Profile",
                    onClick: () => router.push("/profile"),
                    Icon: <User className="h-4 w-4 text-text-muted" />,
                  },
                  {
                    label: "Settings",
                    onClick: () => router.push("/settings"),
                    Icon: <Settings className="h-4 w-4 text-text-muted" />,
                  },
                  {
                    label: "Sign Out",
                    onClick: () => logout(),
                    Icon: <LogOut className="h-4 w-4" />,
                    className: "text-red-600 hover:bg-red-50",
                  },
                ]}
              >
                {avatarElement}
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="text-[15px] font-medium text-text-light hover:text-primary transition-colors px-3 py-2 link-animated"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="btn-warm"
                >
                  Post a Job
                </Link>
              </div>
            )}
          </div>

          {/* ── Mobile: Avatar + Hamburger ── */}
          <div className="flex md:hidden items-center gap-2">
            {isAuthenticated && (
              <Link href="/dashboard" className="flex shrink-0 rounded-full overflow-hidden">
                {showAvatar ? (
                  <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" onError={() => setImgError(true)} />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-[12px] font-semibold">
                    {initial}
                  </span>
                )}
              </Link>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-bg-alt transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="h-5 w-5 text-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              ) : (
                <svg className="h-5 w-5 text-text-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* ── Mobile menu ── */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border py-2 pb-4 animate-fade-in">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block px-3 py-2.5 text-[15px] font-medium rounded-lg transition-colors ${
                  isActive(link.href)
                    ? "text-primary bg-primary/[0.05]"
                    : "text-text-light hover:text-primary hover:bg-bg-alt"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {!isAuthenticated && !isLoading && (
              <div className="mt-3 pt-3 border-t border-border flex gap-2 px-3">
                <Link href="/login" className="flex-1 text-center text-sm font-medium text-text-light border border-border rounded-[--radius-button] py-2.5 hover:bg-bg-alt transition-all duration-200">
                  Sign In
                </Link>
                <Link href="/signup" className="flex-1 text-center text-sm font-semibold text-white bg-accent-warm rounded-[--radius-button] py-2.5 hover:bg-accent-warm-hover transition-all duration-200">
                  Post a Job
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
