"use client";

import { useState } from "react";

interface ReportReplyFormProps {
  reporterEmail: string;
  jobTitle: string;
}

export default function ReportReplyForm({ reporterEmail, jobTitle }: ReportReplyFormProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/reply-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: reporterEmail,
          job_title: jobTitle,
          message: message.trim(),
        }),
      });
      if (res.ok) {
        setSent(true);
        setMessage("");
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
        <svg className="h-4 w-4 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <p className="text-sm text-emerald-700">Reply sent to {reporterEmail}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-primary/20 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-colors cursor-pointer"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
        Reply to Reporter
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-alt/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-light">
          Reply to {reporterEmail}
        </h4>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-text-muted hover:text-text-light transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`Thank you for reporting "${jobTitle}". We've reviewed it and...`}
        rows={4}
        className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
      />
      <button
        onClick={handleSend}
        disabled={sending || !message.trim()}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer"
      >
        {sending ? "Sending..." : "Send Email"}
      </button>
    </div>
  );
}
