"use client";

import React from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserGroupIcon,
  CircleArrowUpRight02Icon,
  BarChartIcon,
  Tick01Icon,
  UserIcon,
  Briefcase01Icon,
  Clock01Icon,
  File01Icon,
  StarIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import Link from "next/link";

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

interface Props {
  stats: AdminStats;
  recentUsers: RecentUser[];
  pendingJobs: PendingJob[];
}

const cardBase =
  "rounded-2xl border border-border/40 bg-white overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const } },
};

export default function AdminBentoDashboard({
  stats,
  recentUsers,
  pendingJobs,
}: Props) {
  const approvalRate =
    stats.totalJobs > 0
      ? Math.round((stats.activeJobs / stats.totalJobs) * 100)
      : 0;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Stat Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <AnimatedStat
          label="Total Users"
          value={stats.totalUsers}
          icon={UserGroupIcon}
          color="text-primary"
          bgColor="bg-primary/5"
          borderColor="border-l-primary"
        />
        <AnimatedStat
          label="Total Jobs"
          value={stats.totalJobs}
          icon={Briefcase01Icon}
          color="text-blue-600"
          bgColor="bg-blue-50"
          borderColor="border-l-blue-500"
        />
        <AnimatedStat
          label="Pending Approvals"
          value={stats.pendingApprovals}
          icon={Clock01Icon}
          color="text-amber-600"
          bgColor="bg-amber-50"
          borderColor="border-l-amber-500"
        />
        <AnimatedStat
          label="Applications"
          value={stats.totalApplications}
          icon={File01Icon}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          borderColor="border-l-emerald-500"
        />
      </div>

      {/* Approval Rate + This Week */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <motion.div variants={item} className={cn(cardBase, "p-5 relative")}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Job Approval Rate
            </span>
            <HugeiconsIcon
              icon={CircleArrowUpRight02Icon}
              size={16}
              className="text-primary"
            />
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-bold tracking-tight text-text">
              {approvalRate}%
            </span>
            <span className="text-xs text-text-muted mb-1">
              ({stats.activeJobs} of {stats.totalJobs})
            </span>
          </div>
          <div className="w-full h-2 bg-bg-alt rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${approvalRate}%` }}
              transition={{ duration: 1, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="h-full bg-primary rounded-full"
            />
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-[0.04]">
            <HugeiconsIcon icon={BarChartIcon} size={96} />
          </div>
        </motion.div>

        <motion.div variants={item} className={cn(cardBase, "p-5")}>
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            This Week
          </span>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center">
                  <HugeiconsIcon icon={UserGroupIcon} size={16} className="text-primary" />
                </div>
                <span className="text-sm text-text">New Users</span>
              </div>
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
                className="text-lg font-bold text-text"
              >
                {stats.newUsersThisWeek}
              </motion.span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <HugeiconsIcon icon={UserGroupIcon} size={16} className="text-emerald-600" />
                </div>
                <span className="text-sm text-text">Seekers</span>
              </div>
              <span className="text-lg font-bold text-text">{stats.totalSeekers}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <HugeiconsIcon icon={Briefcase01Icon} size={16} className="text-blue-600" />
                </div>
                <span className="text-sm text-text">Employers</span>
              </div>
              <span className="text-lg font-bold text-text">{stats.totalEmployers}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent Users + Pending Approvals */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Recent Signups */}
        <motion.div variants={item} className={cardBase}>
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Recent Signups</h2>
            <Link
              href="/admin/users"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark transition-colors"
            >
              View all
              <HugeiconsIcon icon={CircleArrowUpRight02Icon} size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border/30">
            {recentUsers.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                No users yet.
              </div>
            ) : (
              recentUsers.map((user, i) => {
                const roleColor =
                  user.role === "admin"
                    ? "bg-amber-400"
                    : user.role === "employer"
                    ? "bg-blue-400"
                    : "bg-emerald-400";

                return (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i, duration: 0.3 }}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-bg-alt/30 transition-colors group"
                  >
                    <div className="relative w-8 h-8 rounded-full bg-bg-alt border border-border/40 flex items-center justify-center shrink-0">
                      <HugeiconsIcon icon={UserIcon} size={14} className="text-text-muted" />
                      <div
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                          roleColor,
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{user.email}</p>
                      <p className="text-xs text-text-muted capitalize">
                        {user.role} &middot; {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <HugeiconsIcon icon={Settings02Icon} size={14} className="text-text-muted" />
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Pending Approvals */}
        <motion.div variants={item} className={cardBase}>
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Pending Approvals</h2>
            <Link
              href="/admin/approvals"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark transition-colors"
            >
              Review all
              <HugeiconsIcon icon={CircleArrowUpRight02Icon} size={12} />
            </Link>
          </div>
          <div className="divide-y divide-border/30">
            {pendingJobs.length === 0 ? (
              <div className="p-8 text-center">
                <HugeiconsIcon icon={Tick01Icon} size={28} className="text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-text">All caught up!</p>
                <p className="text-xs text-text-muted mt-0.5">No pending approvals.</p>
              </div>
            ) : (
              pendingJobs.map((job, i) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i, duration: 0.3 }}
                >
                  <Link
                    href="/admin/approvals"
                    className="flex items-center gap-3 px-5 py-3 hover:bg-bg-alt/30 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200/40 flex items-center justify-center shrink-0">
                      <HugeiconsIcon icon={Clock01Icon} size={14} className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{job.title}</p>
                      <p className="text-xs text-text-muted">
                        {job.company_name} &middot; {new Date(job.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200/40 shrink-0">
                      Pending
                    </span>
                    <HugeiconsIcon
                      icon={CircleArrowUpRight02Icon}
                      size={14}
                      className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Quick Links */}
      <motion.div variants={item}>
        <h2 className="text-sm font-semibold text-text mb-3">Quick Links</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Job Approvals", desc: "Review pending listings", href: "/admin/approvals", icon: Tick01Icon, color: "text-amber-600", bg: "bg-amber-50" },
            { title: "User Management", desc: "Manage all accounts", href: "/admin/users", icon: UserGroupIcon, color: "text-primary", bg: "bg-primary/5" },
            { title: "Analytics", desc: "Platform-wide stats", href: "/admin/analytics", icon: BarChartIcon, color: "text-blue-600", bg: "bg-blue-50" },
            { title: "Featured Jobs", desc: "Curate top listings", href: "/admin/featured", icon: StarIcon, color: "text-purple-600", bg: "bg-purple-50" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(cardBase, "p-4 group flex flex-col gap-3")}
            >
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110", link.bg)}>
                <HugeiconsIcon icon={link.icon} size={18} className={link.color} />
              </div>
              <div>
                <p className="text-sm font-medium text-text group-hover:text-primary transition-colors">
                  {link.title}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{link.desc}</p>
              </div>
              <div className="mt-auto flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Open
                <HugeiconsIcon icon={CircleArrowUpRight02Icon} size={10} />
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function AnimatedStat({
  label,
  value,
  icon,
  color,
  bgColor,
  borderColor,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <motion.div
      variants={item}
      className={cn(
        cardBase,
        "p-5 border-l-4 flex items-center justify-between group",
        borderColor,
      )}
    >
      <div>
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">{label}</p>
        <motion.p
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, type: "spring", bounce: 0.3 }}
          className="mt-1 text-2xl font-bold text-text"
        >
          {value.toLocaleString()}
        </motion.p>
      </div>
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6", bgColor)}>
        <HugeiconsIcon icon={icon} size={20} className={color} />
      </div>
    </motion.div>
  );
}
