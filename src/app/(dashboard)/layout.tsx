import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SidebarNav from "@/components/SidebarNav";
import PresenceHeartbeat from "@/components/messaging/PresenceHeartbeat";
import UnreadBadge from "@/components/messaging/UnreadBadge";

const seekerLinks = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/profile", label: "My Profile", icon: "user" },
  { href: "/browse-jobs", label: "Browse Jobs", icon: "search" },
  { href: "/applications", label: "My Applications", icon: "file-text" },
  { href: "/messages", label: "Messages", icon: "mail" },
  { href: "/saved", label: "Saved Jobs", icon: "bookmark" },
  { href: "/alerts", label: "Job Alerts", icon: "bell" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const employerLinks = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/post-job", label: "Post a Job", icon: "plus-circle" },
  { href: "/my-listings", label: "My Listings", icon: "list" },
  { href: "/messages", label: "Inbox", icon: "mail" },
  { href: "/browse-candidates", label: "Browse Candidates", icon: "users" },
  { href: "/company-profile", label: "Company Profile", icon: "building" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const adminLinks = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/approvals", label: "Job Approvals", icon: "check-circle" },
  { href: "/admin/analytics", label: "Analytics", icon: "bar-chart" },
  { href: "/admin/featured", label: "Featured Jobs", icon: "star" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user role from users table
  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (userData?.role as string) ?? (user.user_metadata?.role as string) ?? "seeker";

  const baseLinks =
    role === "admin"
      ? adminLinks
      : role === "employer"
        ? employerLinks
        : seekerLinks;

  // Inject unread badge into the messages/inbox sidebar link
  const navLinks = baseLinks.map((link) =>
    link.href === "/messages"
      ? { ...link, badge: <UnreadBadge /> }
      : link
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:top-16 md:bottom-0 border-r border-border bg-[--color-surface] z-30">
        <div className="flex flex-col flex-1 overflow-y-auto px-3 py-6">
          <SidebarNav links={navLinks} />

          {/* Sign out at bottom */}
          <div className="mt-auto pt-4 border-t border-border">
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-64">
        <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-6xl">
          {children}
        </div>
      </main>

      {/* Presence heartbeat */}
      <PresenceHeartbeat />
    </div>
  );
}
