"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import ThemeSwitch from "@/components/ui/theme-switch";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { FloatingNav } from "@/components/ui/floating-navbar";
import { LayoutGrid, User, Users, Settings, LogOut, Search, Info, Building, Compass, Shield, ArrowRightLeft } from "lucide-react";
import UnreadBadge from "@/components/messaging/UnreadBadge";

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

  // Only track scroll on homepage where floating nav takes over
  useEffect(() => {
    if (pathname !== "/") {
      setScrolledPastTop(false);
      return;
    }
    function handleScroll() {
      setScrolledPastTop(window.scrollY > 80);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  const isEmployer = userRole === "employer";
  const isAdmin = userRole === "admin";
  const canBeAdmin = isAdminUser;

  const aboutOrExplore = isAuthenticated
    ? { href: "/explore", label: "Explore" }
    : { href: "/about", label: "About" };

  const navLinks = isAdmin
    ? [
        { href: "/admin/approvals", label: "Approvals" },
        { href: "/admin/users", label: "Users" },
        aboutOrExplore,
        { href: "/dashboard", label: "Dashboard" },
      ]
    : isEmployer
    ? [
        { href: "/browse-candidates", label: "Browse Candidates" },
        aboutOrExplore,
        { href: "/dashboard", label: "Dashboard" },
      ]
    : [
        { href: "/jobs", label: "Find Jobs" },
        aboutOrExplore,
        ...(isAuthenticated ? [{ href: "/dashboard", label: "Dashboard" }] : []),
      ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/jobs") return pathname.startsWith("/jobs") || pathname.startsWith("/browse-jobs");
    if (href === "/browse-candidates") return pathname.startsWith("/browse-candidates") || pathname.startsWith("/candidates");
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/explore") return pathname === "/explore";
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

  // ── Dropdown options (with role switching) ──
  const switchLabel = isEmployer
    ? "Switch to Job Seeker"
    : isAdmin
    ? "Switch to Job Seeker"
    : "Switch to Employer";

  const dropdownOptions = isAdmin
    ? [
        {
          label: "Admin Dashboard",
          onClick: () => router.push("/dashboard"),
          Icon: <LayoutGrid className="h-4 w-4 text-text-muted" />,
        },
        {
          label: "Switch to Job Seeker",
          onClick: () => handleSwitchRole("seeker"),
          Icon: <ArrowRightLeft className="h-4 w-4 text-text-muted" />,
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
          className: "text-red-500 hover:bg-red-500/10",
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
          label: switchLabel,
          onClick: () => handleSwitchRole(isEmployer ? "seeker" : "employer"),
          Icon: <ArrowRightLeft className="h-4 w-4 text-text-muted" />,
        },
        ...(canBeAdmin ? [{
          label: "Switch to Admin",
          onClick: () => handleSwitchRole("admin"),
          Icon: <Shield className="h-4 w-4 text-text-muted" />,
        }] : []),
        {
          label: "Settings",
          onClick: () => router.push("/settings"),
          Icon: <Settings className="h-4 w-4 text-text-muted" />,
        },
        {
          label: "Sign Out",
          onClick: () => logout(),
          Icon: <LogOut className="h-4 w-4" />,
          className: "text-red-500 hover:bg-red-500/10",
        },
      ];

  return (
    <>
      {/* ── Static navbar ── */}
      <header
        className={`sticky top-0 z-50 bg-[--color-bg]/95 backdrop-blur-sm ${
          pathname === "/"
            ? `transition-all duration-200 ${scrolledPastTop ? "-translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}`
            : ""
        }`}
      >
        <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
          <div className="relative flex h-16 items-center justify-between">

            {/* ── Left: Wordmark ── */}
            <Link href="/" className="flex items-center shrink-0 gap-0.5">
              <Image
                src="/logo-icon.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
              />
              <span className="font-display text-xl font-bold tracking-tight text-primary">
                JobLinks
              </span>
              <span className="hidden sm:inline text-[11px] font-medium text-text-muted/70 border-l border-border pl-2.5 leading-tight">
                Antigua&apos;s Career Network
              </span>
            </Link>

            {/* ── Center: Nav links (desktop) ── */}
            <nav className="hidden md:flex items-center gap-1 mx-auto">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-4 py-2 text-[14px] font-medium rounded-lg transition-colors ${
                    isActive(link.href)
                      ? "text-primary"
                      : "text-text-light hover:text-primary hover:bg-[--color-surface]/50 link-animated"
                  }`}
                >
                  {link.label}
                  {isActive(link.href) && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-primary rounded-full" />
                  )}
                </Link>
              ))}
            </nav>

            {/* ── Right: Role switcher + Avatar + Theme toggle (desktop) ── */}
            <div className="hidden md:flex items-center gap-2.5 shrink-0">
              {isLoading ? (
                <div className="h-9 w-9" />
              ) : isAuthenticated ? (
                <>
                  {/* Messages icon */}
                  {userRole !== "admin" && (
                    <Link
                      href="/messages"
                      className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-[--color-surface]/70 transition-colors"
                      aria-label="Messages"
                    >
                      <svg className="h-[18px] w-[18px] text-text-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                      </svg>
                      <span className="absolute -top-0.5 -right-0.5">
                        <UnreadBadge />
                      </span>
                    </Link>
                  )}

                  {/* Avatar dropdown (account actions only) */}
                  <DropdownMenu
                    header={
                      <p className="text-[13px] font-medium text-text truncate">{user?.email}</p>
                    }
                    dividerAfter={isAdmin ? [0, 1] : [1, canBeAdmin ? 3 : 2]}
                    options={dropdownOptions}
                  >
                    {avatarElement}
                  </DropdownMenu>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className="text-[14px] font-medium text-text-light hover:text-primary transition-colors px-3 py-2 link-animated"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    className="btn-warm text-xs px-4 py-2"
                  >
                    Create Account
                  </Link>
                </div>
              )}

              {/* Theme toggle — far right */}
              <ThemeSwitch className="-mr-1.5" />
            </div>

            {/* ── Mobile: Role switcher + Avatar + Hamburger + Theme toggle ── */}
            <div className="flex md:hidden items-center gap-2">
              {isAuthenticated && !isLoading && (
                <>
                  {userRole !== "admin" && (
                    <Link
                      href="/messages"
                      className="relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-[--color-surface]/70 transition-colors"
                      aria-label="Messages"
                    >
                      <svg className="h-4 w-4 text-text-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                      </svg>
                      <span className="absolute -top-0.5 -right-0.5">
                        <UnreadBadge />
                      </span>
                    </Link>
                  )}
                  <Link href="/dashboard" className="flex shrink-0 rounded-full overflow-hidden">
                    {showAvatar ? (
                      <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" onError={() => setImgError(true)} />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-[12px] font-semibold">
                        {initial}
                      </span>
                    )}
                  </Link>
                </>
              )}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[--color-surface]/50 transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="h-5 w-5 text-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                ) : (
                  <svg className="h-5 w-5 text-text-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
                )}
              </button>
              {/* Theme toggle — far right */}
              <ThemeSwitch className="h-7 w-12 -mr-1.5 [&>span:first-child]:h-5 [&>span:first-child]:w-5" />
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
                      : "text-text-light hover:text-primary hover:bg-[--color-surface]/50"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {isAuthenticated && !isLoading && (
                <div className="mt-3 pt-3 border-t border-border/40 space-y-1 px-3">
                  <Link
                    href={isEmployer ? "/company-profile" : "/profile"}
                    className="flex items-center gap-3 px-3 py-2.5 text-[15px] font-medium text-text-light rounded-lg hover:text-primary hover:bg-[--color-surface]/50 transition-colors"
                  >
                    {isEmployer ? <Building className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    {isEmployer ? "Company Profile" : "Profile"}
                  </Link>
                  <button
                    onClick={() => handleSwitchRole(isEmployer ? "seeker" : isAdmin ? "seeker" : "employer")}
                    disabled={switching}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-[15px] font-medium text-text-light rounded-lg hover:text-primary hover:bg-[--color-surface]/50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    {switching ? "Switching..." : switchLabel}
                  </button>
                  {canBeAdmin && !isAdmin && (
                    <button
                      onClick={() => handleSwitchRole("admin")}
                      disabled={switching}
                      className="flex items-center gap-3 w-full px-3 py-2.5 text-[15px] font-medium text-text-light rounded-lg hover:text-amber-600 hover:bg-amber-500/10 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Shield className="h-4 w-4" />
                      Switch to Admin
                    </button>
                  )}
                  <Link
                    href="/settings"
                    className="flex items-center gap-3 px-3 py-2.5 text-[15px] font-medium text-text-light rounded-lg hover:text-primary hover:bg-[--color-surface]/50 transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                  <button
                    onClick={() => logout()}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-[15px] font-medium text-red-500 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              )}
              {!isAuthenticated && !isLoading && (
                <div className="mt-3 pt-3 border-t border-border/40 flex gap-2 px-3">
                  <Link href="/login" className="flex-1 text-center text-sm font-medium text-text-light border border-border rounded-[--radius-button] py-2.5 hover:bg-[--color-surface]/50 transition-all duration-200">
                    Sign In
                  </Link>
                  <Link href="/signup" className="flex-1 text-center text-sm font-semibold text-white bg-accent-warm rounded-[--radius-button] py-2.5 hover:bg-accent-warm-hover transition-all duration-200">
                    Create Account
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Floating nav (homepage only) ── */}
      {pathname === "/" && <FloatingNav
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
            ) : link.href === "/explore" ? (
              <Compass className="h-4 w-4" />
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
      />}
    </>
  );
}
