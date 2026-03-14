"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import type { InboxConversation, ApplicationStatus } from "@/lib/types";

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: "bg-primary/10 text-primary",
  shortlisted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  hired: "bg-accent-warm/10 text-amber-700",
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  hired: "Hired",
};

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

  const isEmployer = userRole === "employer";
  const pageTitle = isEmployer ? "Inbox" : "Messages";
  const pageSubtitle = isEmployer
    ? "Messages from applicants for your job listings."
    : "Your conversations with employers about your applications.";

  useEffect(() => {
    if (authLoading || !user) return;

    async function fetchInbox() {
      try {
        const res = await fetch("/api/messages/conversations");
        if (res.ok) {
          const data = await res.json();
          setConversations(data);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }

    fetchInbox();
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold font-display text-text sm:text-3xl">{pageTitle}</h1>
        <p className="mt-1 text-sm text-text-light">{pageSubtitle}</p>
        <div className="mt-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-white p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 skeleton rounded" />
                  <div className="h-3 w-2/3 skeleton rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold font-display text-text sm:text-3xl">{pageTitle}</h1>
      <p className="mt-1 text-sm text-text-light">{pageSubtitle}</p>

      {conversations.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-alt">
            <svg className="h-8 w-8 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-text">No messages yet</h3>
          <p className="mt-1 text-sm text-text-light max-w-sm mx-auto">
            {isEmployer
              ? "When candidates message you about job applications, they'll appear here."
              : "When you apply to jobs and message employers, your conversations will appear here."}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {conversations.map((conv) => {
            const appStatus = conv.application_context.application_status as ApplicationStatus;

            return (
              <Link
                key={conv.id}
                href={`/messages/${conv.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-white p-4 sm:p-5 transition-all duration-300 hover:border-primary/20 hover:shadow-md hover:shadow-primary/[0.04]"
              >
                {/* Avatar */}
                <div className="shrink-0">
                  {conv.other_participant.avatar_url ? (
                    <img
                      src={conv.other_participant.avatar_url}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-sm">
                      {conv.other_participant.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Row 1: Name + time */}
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`text-sm font-semibold truncate ${conv.unread_count > 0 ? "text-text" : "text-text-light"} group-hover:text-primary transition-colors`}>
                      {conv.other_participant.display_name}
                    </h3>
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {conv.last_message_at ? timeAgo(conv.last_message_at) : ""}
                    </span>
                  </div>

                  {/* Row 2: Job title + application status */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-text-muted truncate">
                      {conv.application_context.job_title}
                      {isEmployer ? "" : ` at ${conv.application_context.company_name}`}
                    </p>
                    {appStatus && (
                      <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${STATUS_COLORS[appStatus] || STATUS_COLORS.applied}`}>
                        {STATUS_LABELS[appStatus] || appStatus}
                      </span>
                    )}
                  </div>

                  {/* Row 3: Last message + unread badge */}
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className={`text-sm truncate ${conv.unread_count > 0 ? "text-text font-medium" : "text-text-light"}`}>
                      {conv.last_message_sender_id === user?.id ? "You: " : ""}
                      {conv.last_message_text || "No messages yet"}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-primary text-white text-[10px] font-bold px-1.5">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
