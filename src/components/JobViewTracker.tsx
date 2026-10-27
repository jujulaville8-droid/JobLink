'use client';

import { useEffect, useRef } from 'react';

type Entry = { eventId: string; sent: boolean; sending?: boolean };
const memory = new Map<string, Entry>();
function entryFor(jobId: string): Entry {
  const existing = memory.get(jobId);
  if (existing) return existing;
  let entry: Entry | undefined;
  try {
    const stored = JSON.parse(sessionStorage.getItem(`job-view:v1:${jobId}`) ?? 'null');
    if (stored && typeof stored.eventId === 'string' && /^[0-9a-f-]{36}$/i.test(stored.eventId)) entry = { eventId: stored.eventId, sent: stored.sent === true };
  } catch { /* In-memory fallback; a reload may count again without storage. */ }
  entry ??= { eventId: crypto.randomUUID(), sent: false };
  memory.set(jobId, entry);
  persist(jobId, entry);
  return entry;
}
function persist(jobId: string, entry: Entry) {
  try { sessionStorage.setItem(`job-view:v1:${jobId}`, JSON.stringify({ eventId: entry.eventId, sent: entry.sent })); } catch { /* best effort */ }
}

export default function JobViewTracker({ jobId, surface }: { jobId: string; surface: 'job_page' | 'job_pane' }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const area = marker.current?.parentElement;
    if (!area || typeof IntersectionObserver === 'undefined') return;
    let intersecting = false;
    let stopped = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => intersecting && document.visibilityState === 'visible' && area.getClientRects().length > 0 && getComputedStyle(area).visibility !== 'hidden';
    const stopTimer = () => { clearTimeout(timer); timer = undefined; };
    const schedule = () => {
      stopTimer();
      if (stopped || !visible()) return;
      timer = setTimeout(async () => {
        if (!visible() || stopped) return;
        let entry: Entry;
        try { entry = entryFor(jobId); } catch { return; }
        if (entry.sent || entry.sending || attempts >= 3) return;
        entry.sending = true;
        attempts++;
        try {
          const response = await fetch(`/api/jobs/${jobId}/view`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: entry.eventId, surface }), keepalive: true,
          });
          if (response.ok) { entry.sent = true; persist(jobId, entry); }
        } catch { /* Retry with the same UUID while the detail remains visible. */ }
        finally { entry.sending = false; }
        if (!entry.sent) schedule();
      }, 1000);
    };
    const observer = new IntersectionObserver(entries => {
      intersecting = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0);
      schedule();
    });
    observer.observe(area);
    document.addEventListener('visibilitychange', schedule);
    return () => { stopped = true; stopTimer(); observer.disconnect(); document.removeEventListener('visibilitychange', schedule); };
  }, [jobId, surface]);
  return <span ref={marker} aria-hidden="true" className="hidden" />;
}
