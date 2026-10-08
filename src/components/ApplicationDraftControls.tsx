"use client";

import { useEffect, useState } from "react";
import {
  APPLICATION_DRAFT_CHANGED, APPLICATION_DRAFT_MAX_LENGTH,
  cleanApplicationDrafts, deleteApplicationDraft, readApplicationDraft, saveApplicationDraft,
} from "@/lib/application-drafts";

export default function ApplicationDraftControls({ userId, jobId, coverLetter, onResume, disabled = false }: {
  userId: string; jobId: string; coverLetter: string; onResume: (text: string) => void; disabled?: boolean;
}) {
  const [saved, setSaved] = useState(() => readApplicationDraft(userId, jobId));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const expiresAt = saved?.expiresAt;

  useEffect(() => {
    function refresh() { setSaved(readApplicationDraft(userId, jobId)); }
    function refreshAndClean() { cleanApplicationDrafts(userId); refresh(); }
    cleanApplicationDrafts(userId);
    window.addEventListener("storage", refreshAndClean);
    window.addEventListener("focus", refreshAndClean);
    window.addEventListener(APPLICATION_DRAFT_CHANGED, refresh);
    const expiryTimer = expiresAt ? window.setTimeout(refreshAndClean, Math.max(0, expiresAt - Date.now()) + 1) : undefined;
    return () => {
      window.removeEventListener("storage", refreshAndClean);
      window.removeEventListener("focus", refreshAndClean);
      window.removeEventListener(APPLICATION_DRAFT_CHANGED, refresh);
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
    };
  }, [userId, jobId, expiresAt]);

  function save() {
    setError("");
    setMessage("");
    if (saveApplicationDraft(userId, jobId, coverLetter)) setMessage("Draft saved on this device. It has not been submitted.");
    else setError("This browser could not save your draft. Keep this page open or copy your cover letter.");
  }

  function resume() {
    const current = readApplicationDraft(userId, jobId);
    setError("");
    setMessage("");
    if (!current) {
      setSaved(null);
      setError("This saved draft is no longer available.");
      return;
    }
    if (coverLetter && coverLetter !== current.coverLetter
      && !window.confirm("Replace the cover letter currently in this form with your saved draft?")) return;
    onResume(current.coverLetter);
    setMessage("Draft restored. Review your cover letter before submitting.");
  }

  function discard() {
    setError("");
    setMessage("");
    if (deleteApplicationDraft(userId, jobId)) setMessage("Saved draft deleted. Your current cover letter has not changed.");
    else setError("This browser could not delete your saved draft. Clear this site's data in your browser settings.");
  }

  return <section aria-label="Application draft" className="rounded-xl border border-border/60 bg-bg-alt/40 p-4 space-y-3">
    <div>
      <h3 className="text-sm font-semibold text-text">Continue later</h3>
      <p id="draft-privacy" className="mt-1 text-xs text-text leading-relaxed">
        Save only on a device you trust. Your cover letter stays in this browser for up to seven days,
        until you submit, sign out or delete it. Expired drafts are removed on your next visit.
        Changes are saved only when you choose Save draft.
      </p>
    </div>
    {saved && <p className="text-xs text-text">A saved draft is available for this job. Choose Resume draft to load it.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={save} disabled={disabled || !coverLetter.trim() || coverLetter.length > APPLICATION_DRAFT_MAX_LENGTH}
        aria-describedby="draft-privacy" className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50">
        Save draft on this device
      </button>
      {saved && <>
        <button type="button" onClick={resume} disabled={disabled} className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50">Resume draft</button>
        <button type="button" onClick={discard} disabled={disabled} className="min-h-11 rounded-lg px-3 py-2 text-sm text-text underline disabled:opacity-50">Delete saved draft</button>
      </>}
    </div>
    {message && <p role="status" className="text-xs text-primary">{message}</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </section>;
}
