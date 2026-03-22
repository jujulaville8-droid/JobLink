"use client";

import React from "react";
import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "@/lib/types";

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function Linkify({ children }: { children: string }) {
  const parts = children.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary-dark break-all"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

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

// Detect system/application messages (cover letter, CV, etc.)
function isSystemMessage(body: string): boolean {
  const systemPatterns = [
    /^📄\s/,
    /^📎\s/,
    /^💼\s/,
    /^🔗\s/,
    /\[View CV\]/i,
    /\[View Resume\]/i,
    /\[Download CV\]/i,
    /\[Download Resume\]/i,
    /Cover Letter:/i,
    /has applied for/i,
    /Application submitted/i,
  ];
  return systemPatterns.some((p) => p.test(body));
}

function AttachmentCard({
  url,
  name,
  isMine,
}: {
  url: string;
  name?: string | null;
  isMine?: boolean;
}) {
  const displayName = name || "Resume.pdf";
  // Route through the secure CV download endpoint
  // The attachment_url stores the storage path, not a full URL
  const isPdf = displayName.toLowerCase().endsWith(".pdf");

  return (
    <a
      href={`/api/cv-download-attachment?path=${encodeURIComponent(url)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all hover:shadow-sm ${
        isMine
          ? "border-white/20 bg-white/10 hover:bg-white/20"
          : "border-border bg-white hover:border-primary/30"
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
        isMine ? "bg-white/15" : "bg-red-50"
      }`}>
        {isPdf ? (
          <svg className={`h-5 w-5 ${isMine ? "text-white/80" : "text-red-500"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M9 13h6" />
            <path d="M9 17h6" />
          </svg>
        ) : (
          <svg className={`h-5 w-5 ${isMine ? "text-white/80" : "text-primary"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-medium truncate ${isMine ? "text-white" : "text-text"}`}>
          {displayName}
        </p>
        <p className={`text-[11px] ${isMine ? "text-white/60" : "text-text-muted"}`}>
          {isPdf ? "PDF Document" : "File"} — Tap to download
        </p>
      </div>
      <svg className={`h-4 w-4 shrink-0 ${isMine ? "text-white/50" : "text-text-muted"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </a>
  );
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
  const isSystem = isSystemMessage(msg.body);

  useEffect(() => {
    animatedMessages.add(msg.id);
  }, [msg.id]);

  const hasAttachment = !!msg.attachment_url;

  // System/application info card style
  if (isSystem) {
    return (
      <div>
        {showTimestamp && (
          <motion.p
            initial={isNew ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-center text-[11px] font-medium text-text-muted/50 py-2 select-none"
          >
            {formatTime(msg.created_at)}
          </motion.p>
        )}
        <div className={`flex justify-center ${isGrouped && !showTimestamp ? "mt-1" : "mt-1.5"}`}>
          <motion.div
            initial={isNew ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="max-w-[85%] w-full border border-border rounded-md bg-slate-50 px-4 py-3"
          >
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 mt-0.5">
                <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-[1.5] text-text whitespace-pre-wrap break-words"><Linkify>{msg.body}</Linkify></p>
                {hasAttachment && <AttachmentCard url={msg.attachment_url!} name={msg.attachment_name} />}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Professional bubble radii — subtle tail on last in group
  const bubbleRadius = isMine
    ? isLastInGroup
      ? "rounded-lg rounded-br-sm"
      : "rounded-lg"
    : isLastInGroup
      ? "rounded-lg rounded-bl-sm"
      : "rounded-lg";

  const bubbleColor = isMine
    ? msg._failed
      ? "bg-red-50 text-red-700 border border-red-200"
      : msg._optimistic
        ? "bg-primary/90 text-white"
        : "bg-primary text-white"
    : "bg-gray-100 text-text sm:bg-gray-50 sm:border sm:border-border";

  return (
    <div>
      {showTimestamp && (
        <motion.p
          initial={isNew ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="text-center text-[11px] font-medium text-text-muted/50 py-2 select-none"
        >
          {formatTime(msg.created_at)}
        </motion.p>
      )}
      <div className={`flex ${isMine ? "justify-end" : "justify-start"} ${isGrouped && !showTimestamp ? "mt-[2px]" : "mt-1.5"}`}>
        <motion.div
          initial={isNew ? {
            opacity: 0,
            y: 6,
            x: isMine ? 8 : -8,
          } : false}
          animate={{
            opacity: 1,
            y: 0,
            x: 0,
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30,
            mass: 0.6,
          }}
          className={`max-w-[85%] sm:max-w-[70%] px-3.5 py-2.5 sm:px-3 sm:py-2 text-[15px] sm:text-[13px] leading-[1.5] ${bubbleRadius} ${bubbleColor}`}
        >
          <p className="whitespace-pre-wrap break-words"><Linkify>{msg.body}</Linkify></p>
          {hasAttachment && <AttachmentCard url={msg.attachment_url!} name={msg.attachment_name} isMine={isMine} />}
          {msg._optimistic && !msg._failed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] mt-0.5 text-white/50 font-medium"
            >
              Sending...
            </motion.p>
          )}
          {msg._failed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] mt-0.5 text-red-500 font-medium"
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
      <div className="flex-1 flex items-center justify-center p-8 text-center bg-gray-50/50">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/[0.06] mb-3">
            <svg className="h-5 w-5 text-primary/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <p className="text-[13px] text-text-muted">Start the conversation with {otherName}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 bg-gray-50/30"
    >
      {/* Load more indicator */}
      <AnimatePresence>
        {loadingMore && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex justify-center py-2"
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-primary/40"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {hasMore && !loadingMore && (
        <div className="flex justify-center py-1.5">
          <button
            onClick={onLoadMore}
            className="text-[11px] text-primary/70 font-medium hover:text-primary transition-colors"
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
