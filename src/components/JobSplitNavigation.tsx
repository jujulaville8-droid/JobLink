"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The /jobs split view keeps the selected listing in the URL (?job=<id>), so
// Back/Forward, refresh and shared links all show the same selection. These
// helpers only add focus handling and mobile "Back to results" on top of that.

const FROM_LIST_KEY = "jobs:opened-from-list";
const LAST_SELECTED_KEY = "jobs:last-selected";
const LIST_POSITION_KEY = "jobs:list-position";
const DESKTOP_QUERY = "(min-width: 1024px)";

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try { return storage()?.getItem(key) ?? null; } catch { return null; }
}
function write(key: string, value: string) {
  try { storage()?.setItem(key, value); } catch { /* Navigation still works without storage. */ }
}
function remove(key: string) {
  try { storage()?.removeItem(key); } catch { /* Storage is optional. */ }
}

function isPlainClick(event: React.MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** The card's title link: a crawlable /jobs/[id] href that selects in place on a plain click. */
export function SelectJobLink({
  jobId,
  selectHref,
  selected,
  className,
  ariaLabel,
  children,
}: {
  jobId: string;
  selectHref: string;
  selected: boolean;
  className: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href={`/jobs/${jobId}`}
      data-job-select={jobId}
      aria-current={selected ? "true" : undefined}
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        // Modified clicks keep opening the full job page (e.g. in a new tab).
        if (!isPlainClick(event)) return;
        event.preventDefault();
        const desktop = window.matchMedia(DESKTOP_QUERY).matches;
        write(LAST_SELECTED_KEY, jobId);
        const list = new URL(selectHref, window.location.origin);
        list.searchParams.delete("job");
        const href = list.pathname + (list.search ? `?${list.searchParams.toString().replace(/\+/g, "%20")}` : "");
        write(LIST_POSITION_KEY, JSON.stringify({ href, top: window.scrollY }));
        if (!desktop) write(FROM_LIST_KEY, "1");
        // Desktop keeps the list where it is; mobile opens the details at the top.
        router.push(selectHref, { scroll: !desktop });
      }}
    >
      {children}
    </Link>
  );
}

/** Always return to the results URL, including after desktop reselection or a deep link. */
export function BackToResults({ href }: { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        remove(FROM_LIST_KEY);
        router.push(href, { scroll: false });
      }}
      className="lg:hidden mb-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary/10 px-5 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/15 transition-colors"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back to results
    </Link>
  );
}

/** On mobile, move focus to the details heading once a selection opens the details view. */
export function FocusDetailHeading() {
  useEffect(() => {
    if (window.matchMedia(DESKTOP_QUERY).matches) return;
    if (read(FROM_LIST_KEY) !== "1") return;
    document.getElementById("job-detail-heading")?.focus({ preventScroll: true });
  }, []);
  return null;
}

/** On mobile, return focus to the listing that was opened when the results come back. */
export function RestoreListFocus({ href }: { href: string }) {
  useEffect(() => {
    remove(FROM_LIST_KEY);
    let position: { href: string; top: number } | null = null;
    try { position = JSON.parse(read(LIST_POSITION_KEY) ?? "null"); } catch { /* Invalid storage is ignored. */ }
    if (!position || position.href !== href) return;
    const top = Number.isFinite(position.top) ? Math.max(0, position.top) : 0;
    const last = read(LAST_SELECTED_KEY);
    // Results may still be streaming when this client component mounts.
    function restore() {
      const link = Array.from(document.querySelectorAll<HTMLElement>("[data-job-select]"))
        .find(element => element.dataset.jobSelect === last);
      if (!link) return false;
      window.scrollTo({ top, behavior: "instant" });
      if (!window.matchMedia(DESKTOP_QUERY).matches) link.focus({ preventScroll: true });
      return true;
    }
    if (restore()) return;
    const observer = new MutationObserver(() => { if (restore()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [href]);
  return null;
}
