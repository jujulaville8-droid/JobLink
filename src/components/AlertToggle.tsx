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
  /** When true, render as a large primary CTA (e.g. on empty-state) */
  emphasis?: boolean;
}

export default function AlertToggle(props: AlertToggleProps) {
  return <AlertToggleContent key={JSON.stringify([props.query, props.category, props.jobType, props.loggedIn])} {...props} />;
}

function AlertToggleContent({
  query,
  category,
  jobType,
  loggedIn,
  emphasis = false,
}: AlertToggleProps) {
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [error, setError] = useState('');

  const resolvedJobType = Array.isArray(jobType) ? jobType[0] : jobType;
  const hasFilters = !!(query?.trim() || category || resolvedJobType);

  // Hide entirely on the success-state header if no filters set —
  // there's nothing meaningful to alert on. Empty-state always shows.
  if (!hasFilters && !emphasis) return null;

  // Anonymous users → route to signup, preserving the search so they
  // can land back on these results after creating an account.
  if (!loggedIn) {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (category) next.set("category", category);
    if (jobType) {
      const first = Array.isArray(jobType) ? jobType[0] : jobType;
      if (first) next.set("job_type", first);
    }
    const signupHref = `/signup?role=seeker${
      next.toString() ? `&next=${encodeURIComponent(`/jobs?${next.toString()}`)}` : ""
    }`;

    if (emphasis) {
      return (
        <a
          href={signupHref}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-accent-hover hover:shadow-lg hover:-translate-y-0.5"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Notify me when one posts
        </a>
      );
    }

    return (
      <a
        href={signupHref}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/[0.12] hover:border-primary/30"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        Notify me of new matches
      </a>
    );
  }

  if (!hasFilters) return <a href="/alerts" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Set up a job alert</a>;

  async function handleCreate() {
    setStatus("saving");
    setError('');
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
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
          setError(data.error || 'Unable to save your alert. Try again.');
        }
        return;
      }

      setStatus("saved");
    } catch {
      setStatus("error");
      setError('Unable to save your alert. Check your connection and try again.');
    }
  }

  if (status === "saved") {
    return (
      <span
        className={
          emphasis
            ? "inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 border border-emerald-200"
            : "inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600"
        }
      >
        <svg
          className={emphasis ? "h-4 w-4" : "h-3.5 w-3.5"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {emphasis ? "Alert saved — we'll email you when matches post" : "Alert saved"}
      </span>
    );
  }

  return (
    <div><button
      onClick={handleCreate}
      disabled={status === "saving"}
      className={
        emphasis
          ? "inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-accent-hover hover:shadow-lg hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 disabled:hover:translate-y-0"
          : "inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/[0.12] hover:border-primary/30 cursor-pointer disabled:opacity-50"
      }
    >
      <svg
        className={emphasis ? "h-4 w-4" : "h-3.5 w-3.5"}
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
      {status === "saving" ? "Saving..." : emphasis ? "Notify me when one posts" : "Notify me of new matches"}
    </button>{error && <p role="alert" className="mt-2 text-sm text-red-700">{error} <a href="/alerts" className="underline">Manage alerts</a></p>}</div>
  );
}
