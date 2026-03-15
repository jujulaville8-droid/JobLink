"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Search, Briefcase, BookmarkCheck, User, Bell, Settings,
  PlusCircle, List, Users, Building, BarChart3, ShieldCheck,
  Star, Compass,
} from "lucide-react";

const seekerLinks = [
  { href: "/jobs", label: "Browse Jobs", desc: "Search and filter opportunities across Antigua", Icon: Search },
  { href: "/applications", label: "My Applications", desc: "Track the status of jobs you've applied to", Icon: Briefcase },
  { href: "/saved", label: "Saved Jobs", desc: "Jobs you've bookmarked for later", Icon: BookmarkCheck },
  { href: "/profile", label: "My Profile", desc: "Update your skills, experience, and CV", Icon: User },
  { href: "/settings", label: "Settings", desc: "Notifications, visibility, and account preferences", Icon: Settings },
];

const employerLinks = [
  { href: "/post-job", label: "Post a Job", desc: "Create a new listing and reach job seekers", Icon: PlusCircle },
  { href: "/my-listings", label: "My Listings", desc: "Manage your active, pending, and closed jobs", Icon: List },
  { href: "/browse-candidates", label: "Browse Candidates", desc: "Find job seekers by skills and experience", Icon: Users },
  { href: "/company-profile", label: "Company Profile", desc: "Update your company details and logo", Icon: Building },
  { href: "/settings", label: "Settings", desc: "Notifications and account preferences", Icon: Settings },
];

const adminLinks = [
  { href: "/admin/approvals", label: "Approvals", desc: "Review and approve pending job listings", Icon: ShieldCheck },
  { href: "/admin/users", label: "Users", desc: "Manage users, bans, and verification", Icon: Users },
  { href: "/admin/analytics", label: "Analytics", desc: "Platform stats and key metrics", Icon: BarChart3 },
  { href: "/admin/featured", label: "Featured Listings", desc: "Manage which jobs are featured", Icon: Star },
];

export default function ExplorePage() {
  const { isAuthenticated, userRole, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/about");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const isEmployer = userRole === "employer";
  const isAdmin = userRole === "admin";

  const primaryLinks = isAdmin ? adminLinks : isEmployer ? employerLinks : seekerLinks;
  const roleLabel = isAdmin ? "Admin" : isEmployer ? "Employer" : "Job Seeker";

  return (
    <div className="min-h-screen bg-bg-alt">
      {/* Header */}
      <section className="bg-gradient-to-br from-[#095355] to-[#0d7377] text-white py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/10 mb-4">
            <Compass className="h-6 w-6" />
          </div>
          <h1 className="text-2xl md:text-4xl font-bold font-display mb-2">
            Explore JobLink
          </h1>
          <p className="text-white/60 text-sm">
            Signed in as <span className="text-white/80 font-medium">{roleLabel}</span>
          </p>
        </div>
      </section>

      {/* Navigation cards */}
      <div className="max-w-4xl mx-auto px-4 py-10 md:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {primaryLinks.map(({ href, label, desc, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-[--radius-card] border border-border bg-white dark:bg-card p-5 hover:border-primary/25 hover:shadow-md hover:shadow-primary/[0.04] transition-all hover-lift"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-primary/8 text-primary group-hover:bg-accent-warm group-hover:text-white transition-all duration-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-text text-[15px] group-hover:text-primary transition-colors">
                    {label}
                  </h3>
                  <p className="text-sm text-text-light mt-0.5 leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick links footer */}
        <div className="mt-10 pt-8 border-t border-border">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <Link href="/dashboard" className="text-primary hover:text-primary-dark font-medium link-animated">
              Dashboard
            </Link>
            <Link href="/jobs" className="text-text-light hover:text-primary link-animated">
              All Jobs
            </Link>
            <Link href="/about" className="text-text-light hover:text-primary link-animated">
              About JobLink
            </Link>
            <Link href="/privacy" className="text-text-light hover:text-primary link-animated">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
