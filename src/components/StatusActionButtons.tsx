"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StatusChangeModal from "./StatusChangeModal";

interface StatusActionButtonsProps {
  applicationId: string;
  jobId: string;
  currentStatus: string;
}

export default function StatusActionButtons({
  applicationId,
  jobId,
  currentStatus,
}: StatusActionButtonsProps) {
  const router = useRouter();
  const [modalStatus, setModalStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied" }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // ignore
    } finally {
      setResetting(false);
    }
  }

  const actions = [
    {
      key: "interview",
      label: "Interview",
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      ),
      style:
        "border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-sm hover:shadow-emerald-100",
    },
    {
      key: "hold",
      label: "Hold",
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      style:
        "border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100 hover:border-amber-300 hover:shadow-sm hover:shadow-amber-100",
    },
    {
      key: "rejected",
      label: "Reject",
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      ),
      style:
        "border-red-200 bg-red-50/50 text-red-600 hover:bg-red-100 hover:border-red-300 hover:shadow-sm hover:shadow-red-100",
    },
  ] as const;

  return (
    <>
      {currentStatus !== "applied" && (
        <button
          onClick={handleReset}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-muted transition-all duration-200 hover:border-primary/30 hover:text-text hover:bg-bg-alt hover:shadow-sm cursor-pointer disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          {resetting ? "..." : "Reset"}
        </button>
      )}
      {actions.map(({ key, label, icon, style }) => {
        if (currentStatus === key) return null;
        return (
          <button
            key={key}
            onClick={() => setModalStatus(key)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${style}`}
          >
            {icon}
            {label}
          </button>
        );
      })}

      {modalStatus && (
        <StatusChangeModal
          applicationId={applicationId}
          jobId={jobId}
          status={modalStatus}
          onClose={() => setModalStatus(null)}
        />
      )}
    </>
  );
}
