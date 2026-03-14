"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Message } from "@/lib/types";

interface MessageThreadProps {
  messages: Message[];
  currentUserId: string;
  otherName: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  if (diffDays === 0) return time;
  if (diffDays === 1) return `Yesterday, ${time}`;
  if (diffDays < 7) {
    return `${d.toLocaleDateString("en-US", { weekday: "short" })}, ${time}`;
  }
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

export default function MessageThread({
  messages,
  currentUserId,
  otherName,
  hasMore,
  loadingMore,
  onLoadMore,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(messages.length);

  // Auto-scroll to bottom on new messages (only if already near bottom)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNewMessage = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;

    if (isNewMessage) {
      // Auto-scroll if user is within 200px of bottom
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
      if (isNearBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      }
    }
  }, [messages.length]);

  // Initial scroll to bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Scroll-to-load: detect when user scrolls to top
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasMore || loadingMore || !onLoadMore) return;

    if (container.scrollTop < 100) {
      const prevHeight = container.scrollHeight;
      onLoadMore();
      // After loading, maintain scroll position
      requestAnimationFrame(() => {
        if (container) {
          const newHeight = container.scrollHeight;
          container.scrollTop = newHeight - prevHeight;
        }
      });
    }
  }, [hasMore, loadingMore, onLoadMore]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5 mb-3">
            <svg className="h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <p className="text-sm text-text-light">Start the conversation with {otherName}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-6 space-y-1"
    >
      {/* Load more indicator */}
      {loadingMore && (
        <div className="flex justify-center py-3">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}
      {hasMore && !loadingMore && (
        <div className="flex justify-center py-2">
          <button
            onClick={onLoadMore}
            className="text-xs text-primary font-medium hover:underline"
          >
            Load older messages
          </button>
        </div>
      )}

      {messages.map((msg, i) => {
        const isMine = msg.sender_id === currentUserId;
        const showTimestamp = i === 0 || (
          new Date(msg.created_at).getTime() - new Date(messages[i - 1].created_at).getTime() > 5 * 60 * 1000
        );
        const prevSameSender = i > 0 && messages[i - 1].sender_id === msg.sender_id;

        return (
          <div key={msg.id}>
            {showTimestamp && (
              <p className="text-center text-[11px] text-text-muted/60 py-3">
                {formatTime(msg.created_at)}
              </p>
            )}
            <div className={`flex ${isMine ? "justify-end" : "justify-start"} ${prevSameSender && !showTimestamp ? "mt-0.5" : "mt-2"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isMine
                    ? msg._failed
                      ? "bg-red-100 text-red-700 rounded-br-md"
                      : msg._optimistic
                        ? "bg-primary/70 text-white rounded-br-md"
                        : "bg-primary text-white rounded-br-md"
                    : "bg-bg-alt text-text rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                {msg._optimistic && !msg._failed && (
                  <p className="text-[10px] mt-1 text-white/60">Sending...</p>
                )}
                {msg._failed && (
                  <p className="text-[10px] mt-1 text-red-500 font-medium">Failed to send</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
