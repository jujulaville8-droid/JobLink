"use client";

import { useState } from "react";

interface AlertToggleProps {
  /** Current search keyword (q param) */
  query?: string;
  /** Current category filter */
  category?: string;
  /** Current job_type filter(s) — first value used */
  jobType?: string | string[];
  /** Whether user is logged in */
  loggedIn: boolean;
}

export default function AlertToggle({
  query,
  category,
  jobType,
  loggedIn,
}: AlertToggleProps) {
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Only show if user is logged in and has at least one active filter
  const hasFilters = !!(query || category || jobType);
  if (!loggedIn || !hasFilters) return null;

  const resolvedJobType = Array.isArray(jobType) ? jobType[0] : jobType;

  async function handleCreate() {
    setStatus("saving");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: query ? [query] : null,
          industry: category || null,
          job_type: resolvedJobType || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.exists) {
          setStatus("saved");
        } else {
          setStatus("error");
        }
        return;
      }

      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Alert saved
      </span>
    );
  }

  return (
    <button
      onClick={handleCreate}
      disabled={status === "saving"}
      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/[0.12] hover:border-primary/30 cursor-pointer disabled:opacity-50"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {status === "saving" ? "Saving..." : "Notify me of new matches"}
    </button>
  );
}
