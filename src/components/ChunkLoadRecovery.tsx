"use client";

import { useEffect } from "react";

// Tabs left open across a deployment keep the old build id. When such a tab
// asks for a JS or CSS chunk that the new deployment no longer serves, the
// load fails with a ChunkLoadError and link clicks silently do nothing (the
// dead dashboard button this fixes). This listener catches that failure and
// reloads the page once so the tab heals onto the current build. The reload
// is guarded by a sessionStorage timestamp, backed by an in-memory value, so
// it can never turn into a reload loop: a second failure within 30 seconds
// is left for a manual refresh.
const RELOAD_KEY = "joblink-chunk-reload-at";
const RELOAD_WINDOW_MS = 30_000;

let inMemoryReloadAt = 0;

function isChunkLoadFailure(message: string | undefined | null): boolean {
  if (!message) return false;
  return (
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Failed to load chunk") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Importing a module script failed")
  );
}

function reloadOnce() {
  const now = Date.now();
  let last = inMemoryReloadAt;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // sessionStorage unavailable; the in-memory value still guards this page.
  }
  if (storage) {
    try {
      const stored = Number(storage.getItem(RELOAD_KEY) ?? 0);
      if (Number.isFinite(stored) && stored > 0) last = stored;
    } catch {
      // A denied read still allows the guarded write below.
    }
  }
  if (now - last < RELOAD_WINDOW_MS) return;
  inMemoryReloadAt = now;
  if (storage) {
    // A denied write (Safari private browsing throws on setItem) must not
    // abort the reload; the guard is best effort, the recovery is the point.
    try {
      storage.setItem(RELOAD_KEY, String(now));
    } catch {
      // Ignore: inMemoryReloadAt already guards this page lifetime.
    }
  }
  window.location.reload();
}

export default function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // A failed chunk load surfaces as an error event on the script or link
      // element itself, which only reaches window listeners in capture phase.
      const target = event.target as
        | (HTMLElement & { src?: string; href?: string })
        | null;
      const resourceUrl = target?.src ?? target?.href ?? "";
      if (resourceUrl.includes("/_next/static/")) {
        reloadOnce();
        return;
      }
      if (isChunkLoadFailure(event.message)) reloadOnce();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as
        | { message?: string; name?: string }
        | string
        | undefined;
      const message =
        typeof reason === "string" ? reason : reason?.message ?? reason?.name;
      if (isChunkLoadFailure(message)) reloadOnce();
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
