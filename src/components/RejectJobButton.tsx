"use client";

import { useState, useRef, useEffect } from "react";

export default function RejectJobButton({
  jobId,
  rejectAction,
}: {
  jobId: string;
  rejectAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("rejection_reason", reason.trim());
    await rejectAction(fd);
    setSubmitting(false);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border-2 border-red-200 text-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-50 transition-colors cursor-pointer"
      >
        Reject
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-border shadow-xl p-6 animate-scale-in">
            <h3 className="text-lg font-semibold font-display text-text">
              Reject Listing
            </h3>
            <p className="mt-1 text-sm text-text-light">
              Provide a reason so the employer knows what to fix. This will be included in the notification email.
            </p>

            <textarea
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Missing job description details, unclear requirements..."
              rows={4}
              className="mt-4 w-full rounded-xl border border-border px-4 py-3 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 resize-none placeholder:text-text-muted/60"
            />

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg-alt transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-xl bg-red-600 text-white px-5 py-2 text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {submitting ? "Rejecting..." : "Reject Listing"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
