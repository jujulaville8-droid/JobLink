"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QuickBuilder from "@/components/cv/QuickBuilder";

export default function CvPromptPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"prompt" | "builder">("prompt");

  if (mode === "builder") {
    return (
      <div className="min-h-screen bg-bg flex items-start justify-center pt-12 px-4">
        <div className="w-full max-w-lg">
          <QuickBuilder
            onComplete={() => router.push("/profile/cv")}
            onSkip={() => router.push("/dashboard")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>

        <h1 className="mt-5 font-display text-2xl text-text">
          Add your Resume
        </h1>
        <p className="mt-2 text-sm text-text-light max-w-sm mx-auto">
          Employers are more likely to reach out to candidates with a Resume. Upload one you already have or build one here.
        </p>

        <div className="mt-8 space-y-3">
          <button
            onClick={() => router.push("/profile")}
            className="w-full rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            Upload my Resume
          </button>

          <button
            onClick={() => setMode("builder")}
            className="w-full rounded-lg border border-border px-6 py-3 text-sm font-medium text-text hover:bg-bg-alt transition-colors"
          >
            Build one instead
          </button>
        </div>

        <button
          onClick={() => router.push("/dashboard")}
          className="mt-6 text-sm text-text-muted hover:text-text transition-colors"
        >
          I&apos;ll do this later
        </button>
      </div>
    </div>
  );
}
