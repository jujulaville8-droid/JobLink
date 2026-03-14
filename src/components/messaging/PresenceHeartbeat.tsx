"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

/**
 * Sends a heartbeat every 2 minutes to keep user presence updated.
 * Mount this once in the root layout or dashboard layout.
 */
export default function PresenceHeartbeat() {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let mounted = true;

    async function heartbeat() {
      if (!mounted) return;
      try {
        await fetch("/api/messages/presence", { method: "POST" });
      } catch { /* ignore */ }
    }

    // Initial heartbeat
    heartbeat();

    // Repeat every 2 minutes
    const interval = setInterval(heartbeat, 2 * 60 * 1000);

    // Send offline signal on unload
    function handleUnload() {
      // Use sendBeacon for reliability on page close
      navigator.sendBeacon?.("/api/messages/presence");
    }
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [isAuthenticated, user]);

  return null;
}
