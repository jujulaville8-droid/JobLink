"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_MESSAGES: Record<string, string> = {
  interview:
    "Great news! We would like to move forward with an interview. We'll be in touch shortly with details.",
  rejected:
    "Thank you for your interest. After careful consideration, we have decided to move forward with other candidates for this position.",
  hold:
    "Your application has been placed on hold. We may follow up with you as the process continues.",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; heading: string; icon: JSX.Element; accent: string; btnClass: string }
> = {
  interview: {
    label: "Interview",
    heading: "Move to Interview",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    accent: "emerald",
    btnClass: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500/20",
  },
  rejected: {
    label: "Reject",
    heading: "Reject Applicant",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    accent: "red",
    btnClass: "bg-red-600 hover:bg-red-700 focus:ring-red-500/20",
  },
  hold: {
    label: "Hold",
    heading: "Place on Hold",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    accent: "amber",
    btnClass: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500/20",
  },
};

const ACCENT_COLORS: Record<string, { iconBg: string; iconText: string; border: string }> = {
  emerald: { iconBg: "bg-emerald-50", iconText: "text-emerald-600", border: "border-emerald-200" },
  red: { iconBg: "bg-red-50", iconText: "text-red-600", border: "border-red-200" },
  amber: { iconBg: "bg-amber-50", iconText: "text-amber-600", border: "border-amber-200" },
};

function getStorageKey(status: string) {
  return `joblinks_template_${status}`;
}

function getSavedTemplate(status: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(getStorageKey(status));
}

function saveTemplate(status: string, message: string) {
  localStorage.setItem(getStorageKey(status), message);
}

function clearTemplate(status: string) {
  localStorage.removeItem(getStorageKey(status));
}

interface StatusChangeModalProps {
  applicationId: string;
  jobId: string;
  status: string;
  onClose: () => void;
}

export default function StatusChangeModal({
  applicationId,
  status,
  onClose,
}: StatusChangeModalProps) {
  const router = useRouter();
  const config = STATUS_CONFIG[status];
  const colors = ACCENT_COLORS[config?.accent || "emerald"];

  const [message, setMessage] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [hasSavedTemplate, setHasSavedTemplate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved template or fall back to default
  useEffect(() => {
    const saved = getSavedTemplate(status);
    if (saved) {
      setMessage(saved);
      setHasSavedTemplate(true);
    } else {
      setMessage(DEFAULT_MESSAGES[status] || "");
      setHasSavedTemplate(false);
    }
  }, [status]);

  function handleResetToDefault() {
    clearTemplate(status);
    setMessage(DEFAULT_MESSAGES[status] || "");
    setHasSavedTemplate(false);
    setSaveAsDefault(false);
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);

    // Save template if checkbox is checked
    if (saveAsDefault) {
      saveTemplate(status, message);
      setHasSavedTemplate(true);
    }

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

  if (!config) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4">
          <div className={`w-10 h-10 rounded-xl ${colors.iconBg} flex items-center justify-center ${colors.iconText}`}>
            {config.icon}
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-text">
              {config.heading}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              The applicant will be notified with this message
            </p>
          </div>
        </div>

        <div className="px-6 pb-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          {/* Message textarea */}
          <div className="relative">
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              Message to applicant
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="block w-full rounded-xl border border-border/60 bg-white px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-text-muted/60 resize-none"
              placeholder="Enter your message..."
            />
          </div>

          {/* Save as default + Reset */}
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div
                className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all duration-200 ${
                  saveAsDefault
                    ? "border-primary bg-primary"
                    : "border-border/80 group-hover:border-primary/40"
                }`}
              >
                {saveAsDefault && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="sr-only"
              />
              <span className="text-xs text-text-light">
                Save as my default template
              </span>
            </label>

            {hasSavedTemplate && (
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-xs text-text-muted hover:text-primary transition-colors cursor-pointer"
              >
                Reset to default
              </button>
            )}
          </div>

          {hasSavedTemplate && !saveAsDefault && (
            <p className="mt-2 text-[11px] text-text-muted italic">
              Using your saved template. Edit above for a one-time change, or check the box to update your default.
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-5">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border-2 border-border px-4 py-2.5 text-sm font-semibold text-text-light hover:border-primary/30 hover:text-text transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex-1 rounded-xl text-white px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus:ring-2 cursor-pointer disabled:opacity-50 ${config.btnClass}`}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                "Confirm & Notify"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
