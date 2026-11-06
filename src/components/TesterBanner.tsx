"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";

const DISMISSED_KEY = "jl-tester-banner-dismissed-v1";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function isDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

// Keep the banner hidden until the browser can check the saved preference.
function serverSnapshot() {
  return true;
}

export default function TesterBanner() {
  const savedDismissal = useSyncExternalStore(subscribe, isDismissed, serverSnapshot);
  const [dismissed, setDismissed] = useState(false);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Dismiss for this visit even when browser storage is unavailable.
    }
  }

  if (dismissed || savedDismissal) return null;

  return (
    <aside aria-label="Android app tester invitation" className="border-b border-border bg-primary-50 text-primary-dark">
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-5 py-2 sm:px-8">
        <div className="flex flex-1 flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <p className="text-sm font-medium">
            The JobLink Android app is almost here. Be one of the first to use it.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://forms.gle/gkifswEw13CYyzu37"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Become a tester
            </a>
            <span className="text-xs">Android phones only</span>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss tester invitation"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-button transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
