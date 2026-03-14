"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

export default function UnreadBadge() {
  const { user, isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let mounted = true;

    async function fetchCount() {
      try {
        const res = await fetch("/api/messages/unread-count");
        if (res.ok) {
          const { count: c } = await res.json();
          if (mounted) setCount(c);
        }
      } catch { /* ignore */ }
    }

    fetchCount();

    // Poll every 30s for new messages
    const interval = setInterval(fetchCount, 30000);

    // Also listen for realtime changes on conversation_participants
    const supabase = createClient();
    const channel = supabase
      .channel("unread-badge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => { fetchCount(); }
      )
      .subscribe();

    return () => {
      mounted = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user]);

  if (count <= 0) return null;

  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}
