"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

export default function PendingApprovalsBadge() {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    let mounted = true;

    async function fetchCount() {
      try {
        const supabase = createClient();
        const { count: c } = await supabase
          .from("job_listings")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_approval");

        if (mounted && c !== null) setCount(c);
      } catch { /* ignore */ }
    }

    fetchCount();

    // Poll every 30s
    const interval = setInterval(fetchCount, 30000);

    // Listen for realtime inserts on job_listings
    const supabase = createClient();
    const channel = supabase
      .channel("pending-approvals-badge")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_listings",
        },
        () => { fetchCount(); }
      )
      .subscribe();

    return () => {
      mounted = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated]);

  if (count <= 0) return null;

  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold px-1 leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}
