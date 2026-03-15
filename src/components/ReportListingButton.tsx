"use client";

import { useState } from "react";

interface ReportListingButtonProps {
  jobId: string;
  loggedIn: boolean;
}

export default function ReportListingButton({ jobId, loggedIn }: ReportListingButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, reason: reason.trim() }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit report");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
        <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        Report submitted
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          if (!loggedIn) {
            window.location.href = `/login?returnTo=/jobs/${jobId}`;
            return;
          }
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-red-500 transition-colors cursor-pointer"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        Report this listing
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for reporting..."
        className="text-xs border border-border rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:border-primary/50"
      />
      <button
        onClick={handleSubmit}
        disabled={loading || !reason.trim()}
        className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50 cursor-pointer"
      >
        {loading ? "Sending..." : "Submit"}
      </button>
      <button
        onClick={() => { setOpen(false); setError(null); }}
        className="text-xs text-text-muted hover:text-text-light cursor-pointer"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
