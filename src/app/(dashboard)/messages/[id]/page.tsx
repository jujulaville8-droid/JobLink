"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import MessageThread from "@/components/messaging/MessageThread";
import ComposeBox from "@/components/messaging/ComposeBox";
import TemplateDrawer from "@/components/messaging/TemplateDrawer";
import ThreadActions from "@/components/messaging/ThreadActions";
import StatusChangeModal from "@/components/StatusChangeModal";
import type { Message, ConversationMeta, ApplicationStatus } from "@/lib/types";

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

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Lock body scroll so the page never jumps — only the chat thread scrolls
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  const [conversationId, setConversationId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [modalStatus, setModalStatus] = useState<string | null>(null);
  const optimisticIdRef = useRef(0);

  // Resolve params
  useEffect(() => {
    params.then((p) => setConversationId(p.id));
  }, [params]);

  // Fetch conversation metadata via dedicated endpoint
  const fetchMeta = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/meta`);
      if (res.status === 404 || res.status === 403) {
        router.push("/messages");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setMeta(data);
      }
    } catch { /* ignore */ }
  }, [conversationId, router]);

  // Fetch messages (initial load — latest page)
  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`);
      if (res.status === 403) { router.push("/messages"); return; }
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setHasMore(data.has_more);
      }
    } catch { /* ignore */ }
  }, [conversationId, router]);

  // Load older messages (scroll-to-load)
  async function loadOlderMessages() {
    if (!conversationId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const res = await fetch(
        `/api/messages/conversations/${conversationId}/messages?before=${oldest.created_at}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.messages.length > 0) {
          setMessages((prev) => [...data.messages, ...prev]);
        }
        setHasMore(data.has_more);
      }
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  }

  // Initial load
  useEffect(() => {
    if (authLoading || !user || !conversationId) return;

    async function init() {
      await Promise.all([fetchMessages(), fetchMeta()]);
      // Mark as read
      fetch(`/api/messages/conversations/${conversationId}/read`, { method: "POST" });
      setLoading(false);
    }

    init();
  }, [user, authLoading, conversationId, fetchMessages, fetchMeta]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            // Replace optimistic message if it matches, or add if new
            const withoutOptimistic = prev.filter(
              (m) => !m._optimistic || m.body !== newMsg.body
            );
            if (withoutOptimistic.some((m) => m.id === newMsg.id)) return withoutOptimistic;
            return [...withoutOptimistic, newMsg];
          });
          // Mark as read since we're viewing
          if (newMsg.sender_id !== user?.id) {
            fetch(`/api/messages/conversations/${conversationId}/read`, { method: "POST" });
            // Employer replied — open the dialogue so compose box appears
            setMeta((prev) => prev ? { ...prev, dialogue_open: true } : prev);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user?.id]);

  // Optimistic send
  async function handleSend(body: string) {
    setSendError(null);
    const tempId = `optimistic-${++optimisticIdRef.current}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user?.id || "",
      body,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };

    // Add optimistic message immediately
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      if (res.ok) {
        const msg = await res.json();
        // Replace optimistic with real message
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempId);
          if (filtered.some((m) => m.id === msg.id)) return filtered;
          return [...filtered, msg];
        });
      } else {
        // Mark as failed
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? { ...m, _failed: true, _optimistic: false } : m)
        );
        const data = await res.json().catch(() => ({}));
        setSendError(data.error || "Failed to send message");
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => m.id === tempId ? { ...m, _failed: true, _optimistic: false } : m)
      );
      setSendError("Network error. Please try again.");
    }
  }

  function handleTemplateSelect(templateBody: string) {
    setShowTemplates(false);
    // The ComposeBox will receive this via a callback
    handleSend(templateBody);
  }

  function handleTemplateInsert(templateBody: string) {
    setShowTemplates(false);
    setComposeValue(templateBody);
  }

  const [composeValue, setComposeValue] = useState("");

  async function handleArchiveToggle() {
    if (!meta) return;
    const method = meta.is_archived ? "DELETE" : "POST";
    const res = await fetch(`/api/messages/conversations/${conversationId}/archive`, { method });
    if (res.ok) {
      setMeta((prev) => prev ? { ...prev, is_archived: !prev.is_archived } : prev);
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex flex-col h-[calc(100dvh-4rem)] -my-6 -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden">
        <div className="border border-border rounded-lg bg-white flex flex-col h-full mx-2 sm:mx-4 my-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="h-5 w-40 skeleton rounded" />
            <div className="h-3 w-60 skeleton rounded mt-2" />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  const isBlocked = meta?.is_blocked ?? false;
  const isEmployer = meta ? user?.id !== meta.seeker_user_id : false;
  const isSeekerAwaitingReply = meta ? (user?.id === meta.seeker_user_id && !meta.dialogue_open) : false;
  const isSeekerRejected = meta ? (user?.id === meta.seeker_user_id && meta.application_status === 'rejected') : false;

  function handleStatusChanged(newStatus: string) {
    setMeta((prev) => prev ? { ...prev, application_status: newStatus as ApplicationStatus } : prev);
    // Refresh messages to pick up system message
    fetchMessages();
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] -my-6 -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden">
      {/* Desktop container card */}
      <div className="flex flex-col h-full mx-0 sm:mx-3 my-0 sm:my-2 border-0 sm:border border-border sm:rounded-lg bg-white overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border bg-white relative z-10">
          <Link
            href="/messages"
            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-md border border-border text-text-light hover:border-primary/30 hover:text-primary transition-colors sm:hidden"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </Link>

          {/* Back button — desktop */}
          <Link
            href="/messages"
            className="hidden sm:flex shrink-0 items-center justify-center h-8 w-8 rounded-md text-text-light hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </Link>

          {/* Avatar with presence */}
          <div className="relative shrink-0">
            {meta?.other_avatar_url ? (
              <img src={meta.other_avatar_url} alt="" className="h-9 w-9 rounded-md object-cover border border-border" />
            ) : (
              <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center text-white font-semibold text-sm">
                {meta?.other_display_name?.charAt(0).toUpperCase() || "?"}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[15px] font-semibold text-text truncate leading-tight">{meta?.other_display_name || "Conversation"}</h2>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-text-muted truncate">
                {meta?.job_title} at {meta?.company_name}
              </p>
              {meta?.application_status && (
                <span className={`shrink-0 inline-block rounded px-1.5 py-[1px] text-[10px] font-medium leading-tight ${STATUS_COLORS[meta.application_status] || STATUS_COLORS.applied}`}>
                  {STATUS_LABELS[meta.application_status] || meta.application_status}
                </span>
              )}
            </div>
          </div>

          {/* Actions menu toggle */}
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="flex items-center justify-center h-8 w-8 rounded-md text-text-light hover:text-primary hover:bg-primary/5 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
              </svg>
            </button>
            {showActions && (
              <ThreadActions
                conversationId={conversationId}
                isArchived={meta?.is_archived || false}
                onArchiveToggle={handleArchiveToggle}
                onDelete={() => { router.push("/messages"); }}
                onClose={() => setShowActions(false)}
              />
            )}
          </div>
        </div>

        {/* Employer status actions */}
        {isEmployer && meta?.application_id && (
          <div className="shrink-0 flex items-center gap-2 px-5 py-2 border-b border-border bg-bg-alt/50">
            <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider mr-1">Status:</span>
            {([
              { key: "interview", label: "Interview", style: "border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/20" },
              { key: "hold", label: "Hold", style: "border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100 hover:border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/20" },
              { key: "rejected", label: "Reject", style: "border-red-200 bg-red-50/50 text-red-600 hover:bg-red-100 hover:border-red-300 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/20" },
            ] as const).map(({ key, label, style }) => {
              const isActive = meta.application_status === key;
              return (
                <button
                  key={key}
                  onClick={() => !isActive && setModalStatus(key)}
                  disabled={isActive}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 cursor-pointer disabled:cursor-default ${
                    isActive ? style + " ring-1 ring-current/20 opacity-90" : style
                  }`}
                >
                  {isActive && (
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Archive banner */}
        {meta?.is_archived && (
          <div className="flex items-center justify-between px-5 py-2 bg-amber-50 border-b border-amber-200">
            <p className="text-xs text-amber-700">This conversation is archived.</p>
            <button
              onClick={handleArchiveToggle}
              className="text-xs font-medium text-amber-700 underline hover:no-underline"
            >
              Move to inbox
            </button>
          </div>
        )}

        {/* Messages */}
        <MessageThread
          messages={messages}
          currentUserId={user?.id || ""}
          otherName={meta?.other_display_name || "them"}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadOlderMessages}
        />

        {/* Send error banner */}
        {sendError && (
          <div className="px-5 py-2 bg-red-50 border-t border-red-200">
            <p className="text-xs text-red-600">{sendError}</p>
          </div>
        )}

        {/* Blocked banner */}
        {isBlocked && (
          <div className="px-5 py-3 bg-bg-alt border-t border-border text-center">
            <p className="text-sm text-text-muted">This participant is blocked and cannot send messages.</p>
          </div>
        )}

        {/* Rejected banner (seeker only) */}
        {!isBlocked && isSeekerRejected && (
          <div className="px-5 py-3 bg-red-50 dark:bg-red-500/10 border-t border-red-200 dark:border-red-500/20 text-center">
            <div className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">Your application was not selected. You can no longer send messages in this conversation.</p>
            </div>
          </div>
        )}

        {/* Awaiting employer reply banner (seeker only) */}
        {!isBlocked && !isSeekerRejected && isSeekerAwaitingReply && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 text-center">
            <div className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 text-amber-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <p className="text-sm text-amber-700">Your application has been sent. You&apos;ll be able to continue the conversation once the employer responds.</p>
            </div>
          </div>
        )}

        {/* Compose area */}
        {!isBlocked && !isSeekerRejected && !isSeekerAwaitingReply && (
          <div className="relative">
            {showTemplates && (
              <TemplateDrawer
                onSelect={handleTemplateInsert}
                onClose={() => setShowTemplates(false)}
              />
            )}
            <ComposeBox
              onSend={handleSend}
              onTemplateToggle={() => setShowTemplates(!showTemplates)}
              externalValue={composeValue}
              onExternalValueConsumed={() => setComposeValue("")}
            />
          </div>
        )}
      </div>

      {/* Status change modal */}
      {modalStatus && meta?.application_id && (
        <StatusChangeModal
          applicationId={meta.application_id}
          status={modalStatus}
          onClose={() => setModalStatus(null)}
          onStatusChanged={handleStatusChanged}
        />
      )}
    </div>
  );
}
