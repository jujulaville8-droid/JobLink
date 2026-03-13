"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { FloatingNav } from "@/components/ui/floating-navbar";
import { LayoutGrid, User, Users, Settings, LogOut, Search, Info, Building, ArrowLeftRight } from "lucide-react";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, userRole, isAdminUser, avatarUrl, logout, setUserRole, isLoading } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [floatingVisible, setFloatingVisible] = useState(false);
  const [scrolledPastTop, setScrolledPastTop] = useState(false);

  const initial = user?.email?.charAt(0).toUpperCase() ?? "U";
  const showAvatar = avatarUrl && !imgError;

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  // Hide static navbar once user scrolls past the navbar height
  useEffect(() => {
    function handleScroll() {
      setScrolledPastTop(window.scrollY > 80);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isEmployer = userRole === "employer";
  const isAdmin = userRole === "admin";
  const canBeAdmin = isAdminUser;

  const navLinks = isAdmin
    ? [
        { href: "/admin/approvals", label: "Approvals" },
        { href: "/admin/users", label: "Users" },
        { href: "/about", label: "About" },
        ...(isAuthenticated ? [{ href: "/dashboard", label: "Dashboard" }] : []),
      ]
    : isEmployer
    ? [
        { href: "/browse-candidates", label: "Browse Candidates" },
        { href: "/about", label: "About" },
        ...(isAuthenticated ? [{ href: "/dashboard", label: "Dashboard" }] : []),
      ]
    : [
        { href: "/jobs", label: "Find Jobs" },
        { href: "/about", label: "About" },
        ...(isAuthenticated ? [{ href: "/dashboard", label: "Dashboard" }] : []),
      ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/jobs") return pathname.startsWith("/jobs") || pathname.startsWith("/browse-jobs");
    if (href === "/browse-candidates") return pathname.startsWith("/browse-candidates") || pathname.startsWith("/candidates");
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href.startsWith("/admin/")) return pathname.startsWith(href);
    return pathname === href;
  }

  const handleFloatingVisibility = useCallback((visible: boolean) => {
    setFloatingVisible(visible);
  }, []);

  async function handleSwitchRole(targetRole?: string) {
    if (switching) return;
    setSwitching(true);
    const newRole = targetRole ?? (isEmployer ? "seeker" : "employer");
    try {
      const res = await fetch("/api/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUserRole(newRole);
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setSwitching(false);
    }
  }

  const avatarElement = (
    <>
      {showAvatar ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/10"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white text-sm font-semibold">
          {initial}
        </span>
      )}
    </>
  );

  return (
    <>
      {/* ── Static navbar — transparent, disappears when floating is visible ── */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolledPastTop
            ? "-translate-y-full opacity-0 pointer-events-none"
            : "translate-y-0 opacity-100"
        }`}
      >
        <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
          <div className="relative flex h-16 items-center justify-between">

            {/* ── Left: Wordmark ── */}
            <Link href="/" className="flex items-center shrink-0 gap-2.5">
              <span className="font-display text-xl font-bold tracking-tight text-primary">
                JobLink
              </span>
              <span className="hidden sm:inline text-[11px] font-medium text-text-muted/70 border-l border-border pl-2.5 leading-tight">
                Antigua&apos;s Career Network
              </span>
            </Link>

            {/* ── Center: Nav links (desktop) ── */}
            <nav className="hidden md:flex items-center gap-1 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-4 py-2 text-[14px] font-medium rounded-lg transition-colors ${
                    isActive(link.href)
                      ? "text-primary"
                      : "text-text-light hover:text-primary hover:bg-white/50 link-animated"
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
                  dividerAfter={[isAdmin ? 1 : 3]}
                  options={[
                    ...(isAdmin
                      ? [
                          {
                            label: "Admin Dashboard",
                            onClick: () => router.push("/dashboard"),
                            Icon: <LayoutGrid className="h-4 w-4 text-text-muted" />,
                          },
                          {
                            label: switching ? "Switching..." : "Switch to Employer",
                            onClick: () => handleSwitchRole("employer"),
                            Icon: <ArrowLeftRight className="h-4 w-4 text-text-muted" />,
                            className: "text-primary hover:bg-primary/5",
                          },
                          {
                            label: switching ? "Switching..." : "Switch to Job Seeker",
                            onClick: () => handleSwitchRole("seeker"),
                            Icon: <ArrowLeftRight className="h-4 w-4 text-text-muted" />,
                            className: "text-primary hover:bg-primary/5",
                          },
                        ]
                      : [
                          {
                            label: "Dashboard",
                            onClick: () => router.push("/dashboard"),
                            Icon: <LayoutGrid className="h-4 w-4 text-text-muted" />,
                          },
                          {
                            label: isEmployer ? "Company Profile" : "Profile",
                            onClick: () => router.push(isEmployer ? "/company-profile" : "/profile"),
                            Icon: isEmployer ? <Building className="h-4 w-4 text-text-muted" /> : <User className="h-4 w-4 text-text-muted" />,
                          },
                          {
                            label: "Settings",
                            onClick: () => router.push("/settings"),
                            Icon: <Settings className="h-4 w-4 text-text-muted" />,
                          },
                          {
                            label: switching
                              ? "Switching..."
                              : isEmployer
                                ? "Switch to Job Seeker"
                                : "Switch to Employer",
                            onClick: () => handleSwitchRole(),
                            Icon: <ArrowLeftRight className="h-4 w-4 text-text-muted" />,
                            className: "text-primary hover:bg-primary/5",
                          },
                          ...(canBeAdmin
                            ? [
                                {
                                  label: switching ? "Switching..." : "Switch to Admin",
                                  onClick: () => handleSwitchRole("admin"),
                                  Icon: <ArrowLeftRight className="h-4 w-4 text-text-muted" />,
                                  className: "text-amber-600 hover:bg-amber-50",
                                },
                              ]
                            : []),
                        ]),
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
                    className="text-[14px] font-medium text-text-light hover:text-primary transition-colors px-3 py-2 link-animated"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/employer/signup"
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
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/50 transition-colors"
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
            <div className="md:hidden border-t border-border/40 py-2 pb-4 animate-fade-in">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block px-3 py-2.5 text-[15px] font-medium rounded-lg transition-colors ${
                    isActive(link.href)
                      ? "text-primary bg-primary/[0.05]"
                      : "text-text-light hover:text-primary hover:bg-white/50"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {!isAuthenticated && !isLoading && (
                <div className="mt-3 pt-3 border-t border-border/40 flex gap-2 px-3">
                  <Link href="/login" className="flex-1 text-center text-sm font-medium text-text-light border border-border rounded-[--radius-button] py-2.5 hover:bg-white/50 transition-all duration-200">
                    Sign In
                  </Link>
                  <Link href="/employer/signup" className="flex-1 text-center text-sm font-semibold text-white bg-accent-warm rounded-[--radius-button] py-2.5 hover:bg-accent-warm-hover transition-all duration-200">
                    Post a Job
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Floating nav: just the buttons, appears on scroll-up ── */}
      <FloatingNav
        onVisibilityChange={handleFloatingVisibility}
        navItems={[
          ...navLinks.map((link) => ({
            name: link.label,
            link: link.href,
            icon: link.href === "/jobs" ? (
              <Search className="h-4 w-4" />
            ) : link.href === "/browse-candidates" ? (
              <Users className="h-4 w-4" />
            ) : link.href === "/about" ? (
              <Info className="h-4 w-4" />
            ) : (
              <LayoutGrid className="h-4 w-4" />
            ),
            active: isActive(link.href),
          })),
        ]}
        rightContent={
          !isLoading && !isAuthenticated ? (
            <Link
              href="/login"
              className="text-[14px] font-medium text-white bg-primary hover:bg-primary-dark px-4 py-1.5 rounded-full transition-colors"
            >
              Sign In
            </Link>
          ) : isAuthenticated ? (
            <Link href="/dashboard" className="flex shrink-0">
              {showAvatar ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover ring-2 ring-primary/20"
                  onError={() => setImgError(true)}
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-xs font-semibold">
                  {initial}
                </span>
              )}
            </Link>
          ) : undefined
        }
      />
    </>
  );
}
