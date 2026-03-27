"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ComposeBoxProps {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
  onTemplateToggle?: () => void;
  externalValue?: string;
  onExternalValueConsumed?: () => void;
}

export default function ComposeBox({
  onSend,
  disabled,
  onTemplateToggle,
  externalValue,
  onExternalValueConsumed,
}: ComposeBoxProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Accept external value (from template insertion)
  useEffect(() => {
    if (externalValue) {
      setBody(externalValue);
      onExternalValueConsumed?.();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus({ preventScroll: true });
          resizeTextarea();
        }
      }, 0);
    }
  }, [externalValue, onExternalValueConsumed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending || disabled) return;

    const msg = body.trim();
    setSending(true);
    setBody("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      await onSend(msg);
    } catch {
      setBody(msg);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function resizeTextarea() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text");
    if (!pasted) return;

    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = body;
    const next = current.slice(0, start) + pasted + current.slice(end);
    const trimmed = next.slice(0, 5000);
    setBody(trimmed);

    // Restore cursor position after React re-render
    const cursorPos = start + pasted.length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = cursorPos;
        textareaRef.current.selectionEnd = cursorPos;
        resizeTextarea();
      }
    });
  }

  const hasText = body.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 px-4 py-3 border-t border-border bg-white">
      {/* Templates button */}
      {onTemplateToggle && (
        <button
          type="button"
          onClick={onTemplateToggle}
          title="Quick replies"
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-md text-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>
      )}

      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onInput={resizeTextarea}
        placeholder="Write a message..."
        disabled={disabled || sending}
        rows={1}
        maxLength={5000}
        className="flex-1 resize-none rounded-xl sm:rounded-md border border-border bg-gray-50 px-3.5 py-2.5 sm:px-3 sm:py-2 text-[15px] sm:text-[13px] leading-[1.5] outline-none transition-colors focus:border-primary/40 focus:bg-white placeholder:text-text-muted/50 disabled:opacity-50"
      />

      <AnimatePresence mode="wait">
        <motion.button
          key={hasText ? "send" : "send-disabled"}
          type="submit"
          disabled={!hasText || sending || disabled}
          transition={{ duration: 0.15 }}
          className="shrink-0 flex items-center justify-center h-9 w-9 sm:h-8 sm:w-8 rounded-xl sm:rounded-md bg-primary text-white transition-colors hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sending ? (
            <motion.div
              className="h-3.5 w-3.5 border-[1.5px] border-white/30 border-t-white rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </motion.button>
      </AnimatePresence>
    </form>
  );
}
