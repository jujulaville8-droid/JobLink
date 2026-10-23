"use client";

import { useSavedJob } from "@/lib/saved-job-sync";

interface SaveJobButtonProps {
  jobId: string;
  initialSaved: boolean;
  loggedIn: boolean;
  /** Full-size labelled button ("Save job"), as in the /jobs detail pane. */
  large?: boolean;
}

export default function SaveJobButton({ jobId, initialSaved, loggedIn, large = false }: SaveJobButtonProps) {
  const { saved, saving: loading, error, toggle } = useSavedJob(jobId, initialSaved);
  if (!loggedIn) return null;

  return (
    <>
    <button
      onClick={() => { if (loggedIn) void toggle(); }}
      disabled={loading}
      aria-pressed={saved}
      className={large
        ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-white px-4 py-2.5 text-sm font-semibold text-text hover:border-primary hover:text-primary transition-colors disabled:opacity-50 cursor-pointer"
        : "inline-flex items-center gap-2 rounded-xl border border-border/60 bg-white px-4 py-2 text-sm font-medium text-text-light hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-50 cursor-pointer"}
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
      {saved ? "Saved" : large ? "Save job" : "Save"}
    </button>
    {error && <p role="alert" className="col-span-2 text-sm text-red-700">{error}</p>}
    </>
  );
}
