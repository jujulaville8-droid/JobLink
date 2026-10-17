"use client";

import { useState } from "react";
import { withReturnTo } from "@/lib/claim-links";

interface AlertToggleProps {
  /** Current search keyword (q param) */
  query?: string;
  /** Current category filter */
  category?: string;
  /** Current job_type filter(s); multiple values require explicit alert setup */
  jobType?: string | string[];
  location?: string;
  /** Whether user is logged in */
  loggedIn: boolean;
  /** When true, render as a large primary CTA (e.g. on empty-state) */
  emphasis?: boolean;
}

export default function AlertToggle(props: AlertToggleProps) {
  return <AlertToggleContent key={JSON.stringify([props.query, props.category, props.jobType, props.location, props.loggedIn])} {...props} />;
}

function AlertToggleContent({
  query,
  category,
  jobType,
  loggedIn,
  location,
  emphasis = false,
}: AlertToggleProps) {
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [error, setError] = useState('');

  const types = [...new Set((Array.isArray(jobType) ? jobType : jobType ? [jobType] : []).filter(Boolean))];
  const resolvedJobType = types.length === 1 ? types[0] : undefined;
  const needsSetup = types.length > 1;
  const criteriaNote = <p className="mt-2 max-w-sm text-xs text-text-light">Alerts match keywords in job titles/descriptions, industry, and one job type. Location and company-name matching are not supported.{needsSetup && ' Choose one job type in alert setup.'}</p>;
  const hasFilters = !!(query?.trim() || category || resolvedJobType);

  // Hide entirely on the success-state header if no filters set —
  // there's nothing meaningful to alert on. Empty-state always shows.
  if (!hasFilters && !emphasis && !location && !needsSetup) return null;

  // Anonymous users → route to signup, preserving the search so they
  // can land back on these results after creating an account.
  if (!loggedIn) {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (category) next.set("category", category);
    for (const type of types) next.append("job_type", type);
    if (location) next.set("location", location);
    const signupHref = withReturnTo('/signup?role=seeker', `/jobs${next.size ? `?${next}` : ''}`);

    if (emphasis) {
      return (
        <div><a
          href={signupHref}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-accent-hover hover:shadow-lg hover:-translate-y-0.5"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Create account to set up an alert
        </a>{criteriaNote}</div>
      );
    }

    return (
      <div><a
        href={signupHref}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/[0.12] hover:border-primary/30"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        Set up a job alert
      </a>{criteriaNote}</div>
    );
  }

  if (!hasFilters || needsSetup) return <div><a href="/alerts" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Set up a job alert</a>{criteriaNote}</div>;

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
      <div><span role="status"
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
      </span>{criteriaNote}</div>
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
    </button>{criteriaNote}{error && <p role="alert" className="mt-2 text-sm text-red-700">{error} <a href="/alerts" className="underline">Manage alerts</a></p>}</div>
  );
}
