"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  UserGroupIcon,
  Message01Icon,
  Folder02Icon,
  CircleArrowUpRight02Icon,
  Search01Icon,
  BarChartIcon,
  Tick01Icon,
  Settings02Icon,
  InformationCircleIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface TabConfig {
  id: string;
  label: string;
  icon: any;
  badge?: string;
  header: string;
  description: string;
}

interface AdminStats {
  totalUsers: number;
  totalSeekers: number;
  totalEmployers: number;
  totalJobs: number;
  activeJobs: number;
  pendingApprovals: number;
  totalApplications: number;
  newUsersThisWeek: number;
}

interface RecentUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

interface PendingJob {
  id: string;
  title: string;
  created_at: string;
  company_name: string;
}

interface AdminBentoDashboardProps {
  stats: AdminStats;
  recentUsers: RecentUser[];
  pendingJobs: PendingJob[];
}

export default function AdminBentoDashboard({
  stats,
  recentUsers,
  pendingJobs,
}: AdminBentoDashboardProps) {
  const TABS: TabConfig[] = [
    {
      id: "dashboard",
      label: "Overview",
      icon: DashboardSquare01Icon,
      header: "Platform Overview",
      description: "Key metrics and performance at a glance.",
    },
    {
      id: "management",
      label: "Users",
      icon: UserGroupIcon,
      header: "Recent Signups",
      description: "Latest users joining the platform.",
      badge: String(stats.newUsersThisWeek),
    },
    {
      id: "threads",
      label: "Approvals",
      icon: Message01Icon,
      header: "Pending Approvals",
      description: "Job listings awaiting your review.",
      badge: stats.pendingApprovals > 0 ? String(stats.pendingApprovals) : undefined,
    },
    {
      id: "resources",
      label: "Quick Links",
      icon: Folder02Icon,
      header: "Admin Tools",
      description: "Manage platform resources and settings.",
    },
  ];

  const [activeTab, setActiveTab] = useState(TABS[0]);

  const content = useMemo(() => {
    switch (activeTab.id) {
      case "dashboard":
        return <OverviewPanel stats={stats} />;
      case "management":
        return <UsersPanel users={recentUsers} />;
      case "threads":
        return <ApprovalsPanel jobs={pendingJobs} />;
      case "resources":
        return <QuickLinksPanel />;
      default:
        return null;
    }
  }, [activeTab.id, stats, recentUsers, pendingJobs]);

  return (
    <div className="flex items-center justify-center w-full antialiased">
      <div className="group relative w-full max-w-xl overflow-hidden rounded-3xl sm:rounded-[2rem] border border-border bg-white shadow-2xl shadow-primary/5 transition-all duration-500 hover:shadow-primary/10 hover:-translate-y-1 m-0">
        <div className="p-4 sm:p-6 space-y-1.5 z-10 relative">
          <h2 className="text-xs text-text-muted uppercase">
            Admin Dashboard
          </h2>
          <p className="text-lg sm:text-2xl text-text font-medium leading-snug max-w-[480px]">
            Platform analytics, approvals, and user management in one place.
          </p>
        </div>

        <div className="relative w-full h-[260px] sm:h-[300px] overflow-hidden rounded-2xl sm:rounded-[2rem]">
          <div className="absolute top-16 left-16 w-full h-full bg-bg-alt rounded-3xl border border-border/50 opacity-80" />

          <div className="absolute top-8 left-24 w-full h-full bg-white rounded-tl-3xl shadow-xl flex flex-col overflow-hidden ring-6 ring-border/30">
            <div className="px-5 py-4 rounded-tl-3xl border-b border-border/70 flex items-center relative backdrop-blur-sm">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-text-muted/20" />
                <div className="w-2 h-2 rounded-full bg-text-muted/20" />
                <div className="w-2 h-2 rounded-full bg-text-muted/20" />
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                <span className="text-xs text-text-muted/50 uppercase">
                  Admin Panel
                </span>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="w-36 border-r border-border/30 p-2 flex flex-col gap-1 pt-6 bg-bg-alt/30">
                <LayoutGroup>
                  {TABS.map((tab) => {
                    const isActive = activeTab.id === tab.id;
                    const Icon = tab.icon;

                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "relative flex items-center gap-1.5 p-2 rounded-xl text-xs transition-colors cursor-pointer",
                          isActive
                            ? "text-text"
                            : "text-text-muted hover:text-text",
                        )}
                      >
                        <HugeiconsIcon
                          icon={Icon}
                          size={14}
                          className="z-20 shrink-0 relative"
                        />
                        <span className="truncate z-20 relative font-medium">
                          {tab.label}
                        </span>
                        {tab.badge && (
                          <span
                            className={cn(
                              "ml-auto text-[8px] leading-none py-0.5 px-1 rounded-md tabular-nums transition-all z-20 relative",
                              isActive
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-bg-alt text-text-muted border border-transparent",
                            )}
                          >
                            {tab.badge}
                          </span>
                        )}

                        {isActive && (
                          <motion.div
                            layoutId="sidebar-pill"
                            className="absolute left-0 w-[2px] h-4 rounded-full bg-primary z-30 border border-primary/20"
                            transition={{
                              type: "spring",
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        )}
                        {isActive && (
                          <motion.div
                            layoutId="backgroundIndicator"
                            className="absolute inset-0 rounded-lg bg-bg-alt border border-border/40"
                            transition={{
                              type: "spring",
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </LayoutGroup>
              </div>

              <div className="flex-1 bg-white p-5 pt-6 flex flex-col gap-4 overflow-hidden relative">
                <header className="flex flex-col gap-0.5">
                  <h3 className="text-xs font-semibold text-text tracking-tight line-clamp-1 uppercase opacity-60">
                    {activeTab.header}
                  </h3>
                  <p className="text-[10px] text-text-muted font-normal leading-tight line-clamp-1">
                    {activeTab.description}
                  </p>
                </header>

                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={activeTab.id}
                    initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="flex-1"
                  >
                    {content}
                  </motion.div>
                </AnimatePresence>

                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none z-20" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewPanel({ stats }: { stats: AdminStats }) {
  const approvalRate = stats.totalJobs > 0
    ? Math.round(((stats.activeJobs) / stats.totalJobs) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="relative p-3.5 rounded-xl border border-border/40 bg-gradient-to-br from-white to-bg-alt/20 overflow-hidden">
        <div className="flex flex-col gap-2 relative z-10">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-medium text-text-muted">
              Job Approval Rate
            </span>
            <HugeiconsIcon
              icon={CircleArrowUpRight02Icon}
              size={12}
              className="text-primary"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xl font-medium tracking-tight text-text">
              {approvalRate}%
            </span>
            <div className="w-full h-1 bg-bg-alt rounded-full overflow-hidden mt-1">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${approvalRate}%` }}
                className="h-full bg-primary rounded-full"
              />
            </div>
          </div>
          <span className="text-[9px] text-text-muted">
            {stats.activeJobs} active of {stats.totalJobs} total listings
          </span>
        </div>
        <div className="absolute -right-2 -bottom-2 opacity-5 scale-150 rotate-12">
          <HugeiconsIcon icon={BarChartIcon} size={64} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl border border-border/40 bg-white/50 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-text">
              {stats.totalUsers.toLocaleString()}
            </span>
            <span className="text-[8px] text-text-muted uppercase font-medium">
              Total Users
            </span>
          </div>
          <HugeiconsIcon icon={Search01Icon} size={14} className="opacity-20" />
        </div>
        <div className="p-3 rounded-xl border border-border/40 bg-white/50 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-text">
              {stats.totalApplications.toLocaleString()}
            </span>
            <span className="text-[8px] text-text-muted uppercase font-medium">
              Applications
            </span>
          </div>
          <HugeiconsIcon
            icon={InformationCircleIcon}
            size={14}
            className="opacity-20"
          />
        </div>
      </div>
    </div>
  );
}

function UsersPanel({ users }: { users: RecentUser[] }) {
  return (
    <div className="flex flex-col h-full not-prose">
      <div className="rounded-xl border border-border/40 overflow-hidden flex flex-col h-full bg-white/50">
        <div className="bg-bg-alt/30 px-3 py-2 border-b border-border/40 flex items-center justify-between">
          <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wider">
            Recent Signups
          </span>
          <Link
            href="/admin/users"
            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-white border border-border/40 hover:border-primary/30 transition-colors"
          >
            <span className="text-[8px] text-text-muted font-medium">
              View All
            </span>
          </Link>
        </div>
        <div className="p-1 flex flex-col gap-0.5">
          {users.length === 0 ? (
            <div className="p-4 text-center">
              <span className="text-[10px] text-text-muted">No recent signups</span>
            </div>
          ) : (
            users.slice(0, 4).map((user) => {
              const statusColor =
                user.role === "admin"
                  ? "bg-amber-400"
                  : user.role === "employer"
                  ? "bg-blue-400"
                  : "bg-emerald-400";

              return (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-alt/30 transition-colors group"
                >
                  <div className="w-6 h-6 rounded-full bg-bg-alt border border-border/40 flex items-center justify-center relative">
                    <HugeiconsIcon
                      icon={UserIcon}
                      size={10}
                      className="text-text-muted"
                    />
                    <div
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white",
                        statusColor,
                      )}
                    />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[10px] font-medium text-text truncate">
                      {user.email}
                    </span>
                    <span className="text-[8px] text-text-muted truncate capitalize">
                      {user.role} &middot; {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <HugeiconsIcon
                      icon={Settings02Icon}
                      size={12}
                      className="text-text-muted"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalsPanel({ jobs }: { jobs: PendingJob[] }) {
  return (
    <div className="flex flex-col gap-3 h-full">
      {jobs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <HugeiconsIcon icon={Tick01Icon} size={24} className="text-emerald-500 mb-2" />
          <span className="text-[10px] text-text-muted font-medium">All caught up!</span>
          <span className="text-[8px] text-text-muted">No pending approvals.</span>
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 overflow-hidden flex flex-col bg-white/50">
          <div className="bg-bg-alt/30 px-3 py-2 border-b border-border/40 flex items-center justify-between">
            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-wider">
              Awaiting Review
            </span>
            <Link
              href="/admin/approvals"
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-white border border-border/40 hover:border-primary/30 transition-colors"
            >
              <span className="text-[8px] text-text-muted font-medium">
                Review All
              </span>
            </Link>
          </div>
          <div className="p-1 flex flex-col gap-0.5">
            {jobs.slice(0, 4).map((job) => (
              <Link
                key={job.id}
                href="/admin/approvals"
                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-bg-alt/30 transition-colors cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-md bg-amber-50 border border-amber-200/40 flex items-center justify-center text-amber-600">
                  <HugeiconsIcon icon={Message01Icon} size={12} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[10px] font-medium text-text truncate">
                    {job.title}
                  </span>
                  <span className="text-[8px] text-text-muted tabular-nums truncate">
                    {job.company_name} &middot; {new Date(job.created_at).toLocaleDateString()}
                  </span>
                </div>
                <HugeiconsIcon
                  icon={CircleArrowUpRight02Icon}
                  size={10}
                  className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickLinksPanel() {
  const links = [
    {
      title: "Job Approvals",
      desc: "Review pending listings.",
      href: "/admin/approvals",
      icon: Tick01Icon,
    },
    {
      title: "User Management",
      desc: "Manage all accounts.",
      href: "/admin/users",
      icon: UserGroupIcon,
    },
    {
      title: "Analytics",
      desc: "Platform-wide stats.",
      href: "/admin/analytics",
      icon: BarChartIcon,
    },
    {
      title: "Featured Jobs",
      desc: "Curate top listings.",
      href: "/admin/featured",
      icon: Folder02Icon,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 h-full">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="p-3 rounded-xl border border-border/40 bg-white/50 flex flex-col gap-2 relative overflow-hidden group hover:border-primary/30 transition-colors"
        >
          <div className="flex flex-col gap-1 z-10">
            <span className="text-[11px] font-medium text-text leading-tight">
              {link.title}
            </span>
            <span className="text-[9px] text-text-muted leading-tight">
              {link.desc}
            </span>
          </div>
          <div className="w-fit flex items-center gap-1.5 px-2 py-1 rounded-md bg-text text-white text-[8px] font-semibold transition-colors group-hover:bg-primary z-10">
            <HugeiconsIcon icon={CircleArrowUpRight02Icon} size={8} />
            Open
          </div>
        </Link>
      ))}
    </div>
  );
}
