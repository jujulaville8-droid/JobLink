"use client";

import { useState } from "react";

interface ThreadActionsProps {
  conversationId: string;
  isArchived: boolean;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ThreadActions({
  conversationId,
  isArchived,
  onArchiveToggle,
  onDelete,
  onClose,
}: ThreadActionsProps) {
  const [showReport, setShowReport] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleReport() {
    if (!reportReason.trim() || reporting) return;
    setReporting(true);
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      if (res.ok || res.status === 409) {
        setReported(true);
        setTimeout(onClose, 1500);
      }
    } catch { /* ignore */ }
    finally { setReporting(false); }
  }

  async function handleBlock() {
    if (blocking) return;
    setBlocking(true);
    try {
      await fetch(`/api/messages/conversations/${conversationId}/block`, { method: "POST" });
      onClose();
      window.location.reload();
    } catch { /* ignore */ }
    finally { setBlocking(false); }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/delete`, { method: "DELETE" });
      if (res.ok) {
        onDelete();
      }
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Dropdown */}
      <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg border border-border shadow-lg z-50 py-1 overflow-hidden">
        {showDeleteConfirm ? (
          <div className="p-3">
            <p className="text-xs font-medium text-text mb-2">Delete this conversation?</p>
            <p className="text-[11px] text-text-muted mb-3">This removes it from your inbox. The other person keeps their copy.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 text-xs py-1.5 rounded-md border border-border text-text-light hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 text-xs py-1.5 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ) : showReport ? (
          <div className="p-3">
            {reported ? (
              <div className="text-center py-2">
                <p className="text-[13px] text-emerald-600 font-medium">Report submitted</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-medium text-text mb-2">Why are you reporting this?</p>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Describe the issue..."
                  maxLength={1000}
                  rows={3}
                  className="w-full text-[13px] rounded-md border border-border bg-gray-50 px-3 py-2 outline-none focus:border-primary/40 focus:bg-white resize-none"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setShowReport(false)}
                    className="flex-1 text-xs py-1.5 rounded-md border border-border text-text-light hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReport}
                    disabled={!reportReason.trim() || reporting}
                    className="flex-1 text-xs py-1.5 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {reporting ? "Sending..." : "Submit"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={() => { onArchiveToggle(); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-text hover:bg-gray-50 transition-colors"
            >
              <svg className="h-3.5 w-3.5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
              </svg>
              {isArchived ? "Move to inbox" : "Archive conversation"}
            </button>

            <button
              onClick={() => setShowReport(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-text hover:bg-gray-50 transition-colors"
            >
              <svg className="h-3.5 w-3.5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              Report conversation
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Delete conversation
            </button>

            <div className="border-t border-border my-1" />

            <button
              onClick={handleBlock}
              disabled={blocking}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
              {blocking ? "Blocking..." : "Block participant"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
