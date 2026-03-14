"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

// Track which message IDs have already been animated
const animatedMessages = new Set<string>();

function MessageBubble({
  msg,
  isMine,
  isGrouped,
  isLastInGroup,
  showTimestamp,
}: {
  msg: Message;
  isMine: boolean;
  isGrouped: boolean;
  isLastInGroup: boolean;
  showTimestamp: boolean;
}) {
  const isNew = !animatedMessages.has(msg.id);

  useEffect(() => {
    animatedMessages.add(msg.id);
  }, [msg.id]);

  // Bubble shape with tail on last message in group
  const bubbleRadius = isMine
    ? isLastInGroup
      ? "rounded-[20px] rounded-br-[6px]"
      : "rounded-[20px]"
    : isLastInGroup
      ? "rounded-[20px] rounded-bl-[6px]"
      : "rounded-[20px]";

  const bubbleColor = isMine
    ? msg._failed
      ? "bg-red-100 text-red-700"
      : msg._optimistic
        ? "bg-primary/80 text-white"
        : "bg-primary text-white"
    : "bg-bg-alt text-text";

  return (
    <div>
      {showTimestamp && (
        <motion.p
          initial={isNew ? { opacity: 0, y: 5 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center text-[11px] font-medium text-text-muted/50 py-3 select-none"
        >
          {formatTime(msg.created_at)}
        </motion.p>
      )}
      <div className={`flex ${isMine ? "justify-end" : "justify-start"} ${isGrouped && !showTimestamp ? "mt-[3px]" : "mt-2"}`}>
        <motion.div
          initial={isNew ? {
            opacity: 0,
            scale: 0.85,
            y: 8,
            x: isMine ? 12 : -12,
          } : false}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            x: 0,
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25,
            mass: 0.8,
          }}
          className={`max-w-[75%] px-[14px] py-[9px] text-[15px] leading-[1.35] ${bubbleRadius} ${bubbleColor} shadow-sm`}
        >
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
          {msg._optimistic && !msg._failed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] mt-1 text-white/50 font-medium"
            >
              Sending...
            </motion.p>
          )}
          {msg._failed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] mt-1 text-red-500 font-medium"
            >
              Not delivered
            </motion.p>
          )}
        </motion.div>
      </div>
    </div>
  );
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
  const [initialScrollDone, setInitialScrollDone] = useState(false);

  // Auto-scroll to bottom on new messages (only if already near bottom)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNewMessage = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;

    if (isNewMessage) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
      if (isNearBottom) {
        // Small delay to let the animation start, then scroll
        requestAnimationFrame(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        });
      }
    }
  }, [messages.length]);

  // Initial scroll to bottom (no animation for existing messages)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && messages.length > 0 && !initialScrollDone) {
      container.scrollTop = container.scrollHeight;
      setInitialScrollDone(true);
    }
  }, [messages.length, initialScrollDone]);

  // Scroll-to-load: detect when user scrolls to top
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasMore || loadingMore || !onLoadMore) return;

    if (container.scrollTop < 100) {
      const prevHeight = container.scrollHeight;
      onLoadMore();
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
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/[0.07] mb-3">
            <svg className="h-7 w-7 text-primary/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <p className="text-[14px] text-text-muted/70">Start the conversation with {otherName}</p>
        </motion.div>
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
      <AnimatePresence>
        {loadingMore && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex justify-center py-3"
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-2 w-2 rounded-full bg-primary/40"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {hasMore && !loadingMore && (
        <div className="flex justify-center py-2">
          <button
            onClick={onLoadMore}
            className="text-xs text-primary/70 font-medium hover:text-primary transition-colors"
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
        const nextDiffSender = i === messages.length - 1 || messages[i + 1].sender_id !== msg.sender_id;
        const nextHasTimestamp = i < messages.length - 1 && (
          new Date(messages[i + 1].created_at).getTime() - new Date(msg.created_at).getTime() > 5 * 60 * 1000
        );
        const isLastInGroup = nextDiffSender || nextHasTimestamp;

        return (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMine={isMine}
            isGrouped={prevSameSender && !showTimestamp}
            isLastInGroup={isLastInGroup}
            showTimestamp={showTimestamp}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
