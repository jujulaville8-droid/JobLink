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
      className="rounded-full p-1.5 text-text-light hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
      title="Remove from saved"
    >
      {removing ? (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-red-500" />
      ) : (
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
    </button>
  );
}
