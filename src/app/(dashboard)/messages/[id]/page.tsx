"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import MessageThread from "@/components/messaging/MessageThread";
import ComposeBox from "@/components/messaging/ComposeBox";
import type { Message } from "@/lib/types";

import type { ApplicationStatus } from "@/lib/types";

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

interface ConversationMeta {
  other_name: string;
  other_avatar: string | null;
  job_title: string;
  company_name: string;
  application_status: ApplicationStatus;
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolve params
  useEffect(() => {
    params.then((p) => setConversationId(p.id));
  }, [params]);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/messages`);
      if (res.status === 403) { router.push("/messages"); return; }
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch { /* ignore */ }
  }, [conversationId, router]);

  // Initial load: messages + mark as read + get meta
  useEffect(() => {
    if (authLoading || !user || !conversationId) return;

    async function init() {
      // Fetch messages
      await fetchMessages();

      // Mark as read
      fetch(`/api/messages/conversations/${conversationId}/read`, { method: "POST" });

      // Fetch conversation meta from inbox (get the one matching this id)
      try {
        const res = await fetch("/api/messages/conversations");
        if (res.ok) {
          const inbox = await res.json();
          const conv = inbox.find((c: { id: string }) => c.id === conversationId);
          if (conv) {
            setMeta({
              other_name: conv.other_participant.display_name,
              other_avatar: conv.other_participant.avatar_url,
              job_title: conv.application_context.job_title,
              company_name: conv.application_context.company_name,
              application_status: conv.application_context.application_status || "applied",
            });
          }
        }
      } catch { /* ignore */ }

      setLoading(false);
    }

    init();
  }, [user, authLoading, conversationId, fetchMessages]);

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
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Mark as read since we're viewing
          fetch(`/api/messages/conversations/${conversationId}/read`, { method: "POST" });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  async function handleSend(body: string) {
    const res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-10rem)]">
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

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-white">
        <Link
          href="/messages"
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-border text-text-light hover:border-primary/30 hover:text-primary transition-all duration-200 sm:hidden"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </Link>

        {meta?.other_avatar ? (
          <img src={meta.other_avatar} alt="" className="h-10 w-10 rounded-full object-cover border border-border" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-sm">
            {meta?.other_name?.charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text truncate">{meta?.other_name || "Conversation"}</h2>
            {meta?.application_status && (
              <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${STATUS_COLORS[meta.application_status] || STATUS_COLORS.applied}`}>
                {STATUS_LABELS[meta.application_status] || meta.application_status}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted truncate">
            {meta?.job_title} at {meta?.company_name}
          </p>
        </div>
      </div>

      {/* Messages */}
      <MessageThread
        messages={messages}
        currentUserId={user?.id || ""}
        otherName={meta?.other_name || "them"}
      />

      {/* Compose */}
      <ComposeBox onSend={handleSend} />
    </div>
  );
}
