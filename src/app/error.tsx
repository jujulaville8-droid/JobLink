"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary.
 *
 * Without this, any throw in a server component fell through to Next's default
 * "Application error: a server-side exception has occurred" screen, which is
 * unbranded and gives the visitor nothing to do.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest correlates this screen with the server log entry; the message
    // itself is not shown to the visitor.
    console.error("[app-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="font-display text-2xl text-text sm:text-3xl">
        Something went wrong on our end
      </h1>
      <p className="mt-3 max-w-md text-text-light">
        This one is on us, not you. Try again in a moment — if it keeps
        happening, let us know at{" "}
        <a
          href="mailto:hello@joblinkantigua.com"
          className="text-primary hover:underline"
        >
          hello@joblinkantigua.com
        </a>
        .
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-text-muted">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary text-sm">
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center rounded-xl border border-border/60 bg-white px-4 py-2 text-sm font-medium text-text-light transition-colors hover:text-primary"
        >
          Go to homepage
        </Link>
      </div>
    </div>
  );
}
