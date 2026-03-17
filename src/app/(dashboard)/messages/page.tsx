"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import type { InboxConversation, ApplicationStatus } from "@/lib/types";

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: "bg-primary/10 text-primary",
  interview: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  hold: "bg-accent-warm/10 text-amber-700",
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected",
  hold: "On Hold",
};

type InboxTab = "active" | "archived";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MessagesPage() {
  const { user, userRole, isLoading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxTab>("active");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isEmployer = userRole === "employer";
  const pageTitle = isEmployer ? "Inbox" : "Messages";

  const fetchInbox = useCallback(async (archived: boolean) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/conversations${archived ? "?archived=true" : ""}`);
      if (!res.ok) throw new Error("Failed to load conversations");
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchInbox(tab === "archived");
  }, [user, authLoading, tab, fetchInbox]);

  // Realtime: refresh inbox when new messages arrive
  useEffect(() => {
    if (!user) return;

    const supabase = createClient();
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => { fetchInbox(tab === "archived"); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, tab, fetchInbox]);

  async function handleArchive(e: React.MouseEvent, convId: string) {
    e.preventDefault();
    e.stopPropagation();
    setArchivingId(convId);

    try {
      const isArchived = tab === "archived";
      const method = isArchived ? "DELETE" : "POST";
      const res = await fetch(`/api/messages/conversations/${convId}/archive`, { method });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
      }
    } catch { /* ignore */ }
    finally { setArchivingId(null); }
  }

  async function handleDelete(e: React.MouseEvent, convId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this conversation? This removes it from your inbox.")) return;
    setDeletingId(convId);

    try {
      const res = await fetch(`/api/messages/conversations/${convId}/delete`, { method: "DELETE" });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
      }
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  if (authLoading) {
    return <InboxSkeleton title={pageTitle} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold font-display text-text sm:text-2xl">{pageTitle}</h1>
      </div>

      {/* Tabs */}
      <div className="mt-3 flex gap-0.5 rounded-md bg-bg-alt p-0.5 w-fit">
        <button
          onClick={() => setTab("active")}
          className={`rounded-[5px] px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
            tab === "active"
              ? "bg-white dark:bg-surface text-text shadow-sm"
              : "text-text-light hover:text-text"
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setTab("archived")}
          className={`rounded-[5px] px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
            tab === "archived"
              ? "bg-white dark:bg-surface text-text shadow-sm"
              : "text-text-light hover:text-text"
          }`}
        >
          Archived
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 p-4 text-center">
          <p className="text-[13px] text-red-600">{error}</p>
          <button
            onClick={() => fetchInbox(tab === "archived")}
            className="mt-2 text-[13px] font-medium text-red-700 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="mt-5 space-y-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-3.5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md skeleton" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-1/3 skeleton rounded" />
                  <div className="h-3 w-2/3 skeleton rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && conversations.length === 0 && (
        <div className="mt-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-bg-alt">
            {tab === "archived" ? (
              <svg className="h-5 w-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            )}
          </div>
          <h3 className="mt-3 text-[15px] font-semibold text-text">
            {tab === "archived" ? "No archived conversations" : "No messages yet"}
          </h3>
          <p className="mt-1 text-[13px] text-text-light max-w-sm mx-auto">
            {tab === "archived"
              ? "Conversations you archive will appear here. You can restore them anytime."
              : isEmployer
                ? "When candidates message you about job applications, they'll appear here."
                : "When you apply to jobs and message employers, your conversations will appear here."
            }
          </p>
        </div>
      )}

      {/* Conversation list */}
      {!loading && !error && conversations.length > 0 && (
        <div className="mt-4 border border-border rounded-lg bg-white dark:bg-surface overflow-hidden divide-y divide-border">
          {conversations.map((conv) => {
            const appStatus = conv.application_context.application_status as ApplicationStatus;
            const isUnread = conv.unread_count > 0;

            return (
              <Link
                key={conv.id}
                href={`/messages/${conv.id}`}
                className={`group relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${
                  isUnread ? "bg-primary/[0.02]" : ""
                }`}
              >
                {/* Avatar with online indicator */}
                <div className="shrink-0 relative">
                  {conv.other_participant.avatar_url ? (
                    <img
                      src={conv.other_participant.avatar_url}
                      alt=""
                      className="h-10 w-10 rounded-md object-cover border border-border"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center text-white font-semibold text-sm">
                      {conv.other_participant.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Row 1: Name + time */}
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`text-[13px] truncate transition-colors ${
                      isUnread ? "font-semibold text-text" : "font-medium text-text-light"
                    } group-hover:text-primary`}>
                      {conv.other_participant.display_name}
                    </h3>
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {conv.last_message_at ? timeAgo(conv.last_message_at) : ""}
                    </span>
                  </div>

                  {/* Row 2: Job title + application status */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[11px] text-text-muted truncate">
                      {conv.application_context.job_title}
                      {isEmployer ? "" : ` at ${conv.application_context.company_name}`}
                    </p>
                    {appStatus && (
                      <span className={`shrink-0 inline-block rounded px-1.5 py-[1px] text-[10px] font-medium leading-tight ${STATUS_COLORS[appStatus] || STATUS_COLORS.applied}`}>
                        {STATUS_LABELS[appStatus] || appStatus}
                      </span>
                    )}
                  </div>

                  {/* Row 3: Last message + unread badge */}
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={`text-[13px] truncate ${isUnread ? "text-text font-medium" : "text-text-light"}`}>
                      {conv.last_message_sender_id === user?.id ? "You: " : ""}
                      {conv.last_message_text || "No messages yet"}
                    </p>
                    {isUnread && (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-bold px-1">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>

                {/* Archive & Delete buttons */}
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150">
                  <button
                    onClick={(e) => handleArchive(e, conv.id)}
                    disabled={archivingId === conv.id}
                    title={tab === "archived" ? "Move to inbox" : "Archive"}
                    className="flex items-center justify-center h-7 w-7 rounded-md text-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
                  >
                    {archivingId === conv.id ? (
                      <div className="h-3 w-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
                    ) : tab === "archived" ? (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8" />
                        <rect x="1" y="3" width="22" height="5" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    disabled={deletingId === conv.id}
                    title="Delete conversation"
                    className="flex items-center justify-center h-7 w-7 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    {deletingId === conv.id ? (
                      <div className="h-3 w-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    )}
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InboxSkeleton({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold font-display text-text sm:text-2xl">{title}</h1>
      <div className="mt-5 border border-border rounded-lg bg-white dark:bg-surface overflow-hidden divide-y divide-border">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-4 py-3.5 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md skeleton" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-1/3 skeleton rounded" />
                <div className="h-3 w-2/3 skeleton rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
