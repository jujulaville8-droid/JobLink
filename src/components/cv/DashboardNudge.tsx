"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Props {
  hasBuiltCv: boolean;
  hasUploadedCv: boolean;
  completionPercentage?: number;
}

const DISMISS_KEY = "cv_nudge_dismiss_count";

export default function DashboardNudge({ hasBuiltCv, hasUploadedCv }: Props) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const count = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    // Hydrate the client-only dismissal count after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(count >= 3);
  }, []);

  function handleDismiss() {
    const count = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10) + 1;
    localStorage.setItem(DISMISS_KEY, String(count));
    setDismissed(true);
  }

  if (dismissed) return null;

  // User has an uploaded CV — don't nag them to build one
  if (hasUploadedCv) return null;

  // No CV at all (neither uploaded nor built)
  if (!hasBuiltCv) {
    return (
      <div className="relative rounded-[--radius-card] border border-primary/20 bg-primary/[0.03] p-5">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-text-muted hover:text-text transition-colors"
          aria-label="Dismiss"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="flex items-start gap-3">
          <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Add your Resume to get noticed</p>
            <p className="text-xs text-text-light mt-0.5">
              Employers are more likely to reach out to candidates with a Resume on their profile.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Link
                href="/profile"
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark transition-colors"
              >
                Upload a Resume
              </Link>

            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
