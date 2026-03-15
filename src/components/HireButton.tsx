"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface HireButtonProps {
  applicationId: string;
  jobId: string;
}

export default function HireButton({ applicationId, jobId }: HireButtonProps) {
  const router = useRouter();
  const [showPrompt, setShowPrompt] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleHire(closeJob: boolean) {
    setLoading(true);
    try {
      const res = await fetch("/api/applications/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId, close_job: closeJob }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
      setShowPrompt(false);
    }
  }

  if (showPrompt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-xl max-w-sm w-full p-6">
          <h3 className="font-display text-lg text-text mb-2">Hire this applicant?</h3>
          <p className="text-sm text-text-light mb-5">
            Would you also like to close this job listing so it no longer accepts new applications?
          </p>
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => handleHire(true)}
              disabled={loading}
              className="w-full rounded-xl bg-primary text-white px-4 py-2.5 text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Processing..." : "Hire & Close Listing"}
            </button>
            <button
              onClick={() => handleHire(false)}
              disabled={loading}
              className="w-full rounded-xl border-2 border-border px-4 py-2.5 text-sm font-semibold text-text-light hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50 cursor-pointer"
            >
              Hire & Keep Listing Open
            </button>
            <button
              onClick={() => setShowPrompt(false)}
              disabled={loading}
              className="w-full text-sm text-text-muted hover:text-text-light transition-colors cursor-pointer py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowPrompt(true)}
      className="rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 px-3 py-1 text-xs font-medium transition-colors cursor-pointer"
    >
      Hire
    </button>
  );
}
