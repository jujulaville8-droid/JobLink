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
import type { Message, ConversationMeta, ApplicationStatus } from "@/lib/types";

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

function lastSeenText(lastSeen: string | null): string {
  if (!lastSeen) return "";
  const diff = Date.now() - new Date(lastSeen).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Active now";
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Active ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Active ${days}d ago`;
  return "";
}

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
      <div className="flex flex-col h-[calc(100dvh-10rem)] -my-6 overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="h-5 w-40 skeleton rounded" />
          <div className="h-3 w-60 skeleton rounded mt-2" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  const isBlocked = meta?.is_blocked ?? false;

  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)] -my-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-white">
        <Link
          href="/messages"
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-border text-text-light hover:border-primary/30 hover:text-primary transition-all duration-200 sm:hidden"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </Link>

        {/* Avatar with presence */}
        <div className="relative shrink-0">
          {meta?.other_avatar_url ? (
            <img src={meta.other_avatar_url} alt="" className="h-10 w-10 rounded-full object-cover border border-border" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-sm">
              {meta?.other_display_name?.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          {meta?.other_is_online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text truncate">{meta?.other_display_name || "Conversation"}</h2>
            {meta?.application_status && (
              <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${STATUS_COLORS[meta.application_status] || STATUS_COLORS.applied}`}>
                {STATUS_LABELS[meta.application_status] || meta.application_status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-text-muted truncate">
              {meta?.job_title} at {meta?.company_name}
            </p>
            {meta?.other_is_online ? (
              <span className="text-[10px] text-emerald-600 font-medium">Online</span>
            ) : meta?.other_last_seen_at ? (
              <span className="text-[10px] text-text-muted">{lastSeenText(meta.other_last_seen_at)}</span>
            ) : null}
          </div>
        </div>

        {/* Actions menu toggle */}
        <div className="relative">
          <button
            onClick={() => setShowActions(!showActions)}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-border text-text-light hover:border-primary/30 hover:text-primary transition-all duration-200"
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
              onClose={() => setShowActions(false)}
            />
          )}
        </div>
      </div>

      {/* Archive banner */}
      {meta?.is_archived && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200">
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
        <div className="px-4 py-2 bg-red-50 border-t border-red-200">
          <p className="text-xs text-red-600">{sendError}</p>
        </div>
      )}

      {/* Blocked banner */}
      {isBlocked && (
        <div className="px-4 py-3 bg-bg-alt border-t border-border text-center">
          <p className="text-sm text-text-muted">This participant is blocked and cannot send messages.</p>
        </div>
      )}

      {/* Compose area */}
      {!isBlocked && (
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
  );
}
