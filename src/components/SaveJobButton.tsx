"use client";

import { useState } from "react";

interface SaveJobButtonProps {
  jobId: string;
  initialSaved: boolean;
  loggedIn: boolean;
}

export default function SaveJobButton({ jobId, initialSaved, loggedIn }: SaveJobButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (!loggedIn) return;
    setLoading(true);
    try {
      const res = await fetch("/api/jobs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSaved(data.saved);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!loggedIn) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-white dark:bg-card px-4 py-2 text-sm font-medium text-text-light hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-50 cursor-pointer"
    >
      <svg
        className={`h-4 w-4 ${saved ? "text-primary fill-primary" : ""}`}
        viewBox="0 0 24 24"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
