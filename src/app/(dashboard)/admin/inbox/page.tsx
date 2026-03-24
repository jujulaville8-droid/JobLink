import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import Link from "next/link";

export default async function AdminInboxPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Get all conversations where the admin is a participant
  const { data: participants } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (!participants || participants.length === 0) {
    return (
      <div>
        <h1 className="font-display text-2xl text-text sm:text-3xl font-bold">
          Applicant Inbox
        </h1>
        <p className="mt-1 text-sm text-text-light">
          Messages from applicants on admin-posted jobs
        </p>
        <div className="mt-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <svg
              className="h-7 w-7 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-text">
            No messages yet
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            When job seekers apply to admin-posted jobs, their messages will
            appear here.
          </p>
        </div>
      </div>
    );
  }

  const convIds = participants.map((p) => p.conversation_id);

  // Get conversations with application context
  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      "id, created_at, application_id, applications(id, status, job_id, seeker_id, applied_at, job_listings(title, companies(company_name)), seeker_profiles(first_name, last_name))"
    )
    .in("id", convIds)
    .order("created_at", { ascending: false });

  // Get latest message for each conversation
  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, body, created_at, sender_id")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false });

  // Build a map of latest message per conversation
  const latestMsg: Record<
    string,
    { body: string; created_at: string; sender_id: string }
  > = {};
  for (const m of messages || []) {
    if (!latestMsg[m.conversation_id]) {
      latestMsg[m.conversation_id] = m;
    }
  }

  // Get unread counts
  const { data: unreadData } = await supabase
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", convIds)
    .neq("sender_id", user.id)
    .eq("is_read", false);

  const unreadMap: Record<string, number> = {};
  for (const u of unreadData || []) {
    unreadMap[u.conversation_id] =
      (unreadMap[u.conversation_id] || 0) + 1;
  }

  const totalUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0);

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const statusColors: Record<string, string> = {
    applied:
      "bg-blue-50 text-blue-700 border-blue-200",
    interview:
      "bg-emerald-50 text-emerald-700 border-emerald-200",
    hold: "bg-amber-50 text-amber-700 border-amber-200",
    rejected:
      "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl text-text sm:text-3xl font-bold">
            Applicant Inbox
          </h1>
          <p className="mt-1 text-sm text-text-light">
            {totalUnread > 0
              ? `${totalUnread} unread message${totalUnread !== 1 ? "s" : ""}`
              : "Messages from applicants on admin-posted jobs"}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {(conversations || []).map((conv) => {
          const app = Array.isArray(conv.applications)
            ? conv.applications[0]
            : conv.applications;
          const job = app?.job_listings;
          const jobData = Array.isArray(job) ? job[0] : job;
          const company = jobData?.companies;
          const companyData = Array.isArray(company)
            ? company[0]
            : company;
          const seeker = app?.seeker_profiles;
          const seekerData = Array.isArray(seeker)
            ? seeker[0]
            : seeker;
          const seekerName = seekerData
            ? `${seekerData.first_name || ""} ${seekerData.last_name || ""}`.trim()
            : "Unknown Applicant";
          const jobTitle = jobData?.title || "Unknown Job";
          const companyName = companyData?.company_name || "";
          const status = app?.status || "applied";
          const latest = latestMsg[conv.id];
          const unread = unreadMap[conv.id] || 0;

          return (
            <Link
              key={conv.id}
              href={`/messages/${conv.id}`}
              className={`block rounded-xl border p-4 transition-all hover:shadow-sm ${
                unread > 0
                  ? "border-primary/20 bg-primary/[0.02]"
                  : "border-border bg-white hover:border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {seekerName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-sm truncate ${
                          unread > 0
                            ? "font-semibold text-text"
                            : "font-medium text-text"
                        }`}
                      >
                        {seekerName}
                      </p>
                      <p className="text-xs text-text-muted truncate">
                        {jobTitle}
                        {companyName ? ` at ${companyName}` : ""}
                      </p>
                    </div>
                  </div>
                  {latest && (
                    <p
                      className={`mt-2 text-xs truncate ${
                        unread > 0
                          ? "text-text font-medium"
                          : "text-text-light"
                      }`}
                    >
                      {latest.sender_id === user.id ? "You: " : ""}
                      {latest.body?.slice(0, 100)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[11px] text-text-muted">
                    {latest
                      ? timeAgo(latest.created_at)
                      : timeAgo(conv.created_at)}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      statusColors[status] || statusColors.applied
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                  {unread > 0 && (
                    <span className="h-5 min-w-[20px] flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white px-1.5">
                      {unread}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
