"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UnsaveButton({ savedJobId }: { savedJobId: string }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  const handleUnsave = async () => {
    setRemoving(true);
    const supabase = createClient();
    await supabase.from("saved_jobs").delete().eq("id", savedJobId);
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleUnsave}
      disabled={removing}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-light transition-all duration-200 hover:border-red-300 hover:bg-red-50 hover:text-red-600 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
      title="Remove from saved"
    >
      {removing ? (
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-red-500" />
      ) : (
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      )}
      {removing ? "Removing..." : "Unsave"}
    </button>
  );
}
