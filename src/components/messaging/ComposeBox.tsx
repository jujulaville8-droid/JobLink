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
  const [justSent, setJustSent] = useState(false);
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
      // Brief send animation
      setJustSent(true);
      setTimeout(() => setJustSent(false), 400);
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
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 px-3 py-2.5 sm:px-4 sm:py-3 bg-white/90 backdrop-blur-xl border-t border-border/50"
    >
      {/* Templates button */}
      {onTemplateToggle && (
        <motion.button
          type="button"
          onClick={onTemplateToggle}
          title="Quick replies"
          whileTap={{ scale: 0.9 }}
          className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full text-text-muted/70 hover:text-primary hover:bg-primary/5 transition-colors duration-150"
        >
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </motion.button>
      )}

      {/* Input area — iMessage pill shape */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="iMessage"
          disabled={disabled || sending}
          rows={1}
          maxLength={5000}
          className="w-full resize-none rounded-full border border-border/70 bg-bg-alt/60 px-4 py-2 pr-11 text-[15px] outline-none transition-all duration-200 focus:border-primary/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,115,119,0.06)] placeholder:text-text-muted/40 disabled:opacity-50"
          style={{ maxHeight: "120px" }}
        />

        {/* Send button — inside the input, iMessage style */}
        <div className="absolute right-1.5 bottom-1">
          <AnimatePresence mode="wait">
            {hasText || sending ? (
              <motion.button
                key="send"
                type="submit"
                disabled={!hasText || sending || disabled}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileTap={{ scale: 0.85 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-white disabled:opacity-40 transition-colors"
              >
                {sending ? (
                  <motion.div
                    className="h-3.5 w-3.5 border-[1.5px] border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  />
                ) : (
                  <motion.svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    animate={justSent ? { y: [0, -3, 0] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                  </motion.svg>
                )}
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </form>
  );
}
