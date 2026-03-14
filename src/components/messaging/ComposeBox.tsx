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
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
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

  function handleInput() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }

  const hasText = body.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4 border-t border-border bg-white">
      {/* Templates button */}
      {onTemplateToggle && (
        <motion.button
          type="button"
          onClick={onTemplateToggle}
          title="Quick replies"
          whileTap={{ scale: 0.9 }}
          className="shrink-0 flex items-center justify-center h-10 w-10 rounded-xl border border-border text-text-muted hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all duration-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </motion.button>
      )}

      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Type a message..."
        disabled={disabled || sending}
        rows={1}
        maxLength={5000}
        className="flex-1 resize-none rounded-xl border border-border bg-bg-alt px-4 py-2.5 text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-text-muted/60 disabled:opacity-50"
      />

      <AnimatePresence mode="wait">
        <motion.button
          key={hasText ? "send" : "send-disabled"}
          type="submit"
          disabled={!hasText || sending || disabled}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="shrink-0 flex items-center justify-center h-10 w-10 rounded-xl bg-primary text-white transition-all duration-200 hover:bg-primary-dark hover:shadow-md hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {sending ? (
            <motion.div
              className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </motion.button>
      </AnimatePresence>
    </form>
  );
}
