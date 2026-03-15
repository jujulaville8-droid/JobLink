"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_MESSAGES: Record<string, string> = {
  interview:
    "Great news! We would like to move forward with an interview. We'll be in touch shortly with details.",
  rejected:
    "Thank you for your interest. After careful consideration, we have decided to move forward with other candidates for this position.",
  hold:
    "Your application has been placed on hold. We may follow up with you as the process continues.",
};

const STATUS_LABELS: Record<string, string> = {
  interview: "Interview",
  rejected: "Reject",
  hold: "Hold",
};

const STATUS_STYLES: Record<string, string> = {
  interview: "bg-emerald-600 hover:bg-emerald-700",
  rejected: "bg-red-600 hover:bg-red-700",
  hold: "bg-amber-600 hover:bg-amber-700",
};

interface StatusChangeModalProps {
  applicationId: string;
  jobId: string;
  status: string;
  onClose: () => void;
}

export default function StatusChangeModal({
  applicationId,
  jobId,
  status,
  onClose,
}: StatusChangeModalProps) {
  const router = useRouter();
  const [message, setMessage] = useState(DEFAULT_MESSAGES[status] || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/applications/${applicationId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, custom_message: message }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update status");
        setLoading(false);
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-xl max-w-md w-full p-6 animate-scale-in">
        <h3 className="font-display text-lg text-text mb-1">
          {STATUS_LABELS[status]} this applicant?
        </h3>
        <p className="text-sm text-text-light mb-4">
          Customize the message that will be sent to the applicant.
        </p>

        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <label className="block text-sm font-medium text-text-light mb-1.5">
          Message to applicant
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="input-base resize-none text-sm"
          placeholder="Enter your message..."
        />

        <div className="flex flex-col gap-2 mt-5">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`w-full rounded-xl text-white px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer ${STATUS_STYLES[status] || "bg-primary hover:bg-primary-dark"}`}
          >
            {loading ? "Updating..." : `Confirm & Send`}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full text-sm text-text-muted hover:text-text-light transition-colors cursor-pointer py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
