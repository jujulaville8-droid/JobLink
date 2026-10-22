import { useEffect, useState } from "react";

type SaveUpdate = { jobId: string; saved?: boolean; pending?: boolean; error?: string | null };
type SaveResult = { saved: boolean } | null;
const EVENT = "joblink:job-saved";
// Only active mutations are shared. No account data is cached across renders.
const pending = new Map<string, Promise<SaveResult>>();
function announce(detail: SaveUpdate) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
}

/** Deduplicate the card and pane's toggle before either control can rerender. */
function toggleSavedJob(jobId: string): Promise<SaveResult> {
  const active = pending.get(jobId);
  if (active) return active;
  const request = (async () => {
    // Install the shared lock before starting the request.
    await Promise.resolve();
    try {
      const response = await fetch("/api/jobs/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!response.ok) throw new Error("Save failed");
      const data = await response.json();
      if (typeof data.saved !== "boolean") throw new Error("Invalid save response");
      announce({ jobId, saved: data.saved });
      return { saved: data.saved };
    } catch {
      announce({ jobId, error: "Could not save this job. Please try again." });
      return null;
    } finally {
      pending.delete(jobId);
      announce({ jobId, pending: false });
    }
  })();
  pending.set(jobId, request);
  announce({ jobId, pending: true, error: null });
  return request;
}

export function useSavedJob(jobId: string, initialSaved: boolean) {
  const [saved, setSaved] = useState(initialSaved);
  const [saving, setSaving] = useState(() => pending.has(jobId));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    function handle(event: Event) {
      const { detail } = event as CustomEvent<SaveUpdate>;
      if (detail.jobId !== jobId) return;
      if (typeof detail.saved === "boolean") setSaved(detail.saved);
      if (typeof detail.pending === "boolean") setSaving(detail.pending);
      if (detail.error !== undefined) setError(detail.error);
    }
    window.addEventListener(EVENT, handle);
    return () => window.removeEventListener(EVENT, handle);
  }, [jobId]);
  return { saved, saving, error, toggle: () => toggleSavedJob(jobId) };
}
