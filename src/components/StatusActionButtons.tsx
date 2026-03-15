"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StatusChangeModal from "./StatusChangeModal";

const BUTTON_STYLES: Record<string, string> = {
  applied: "border-gray-300 text-gray-600 hover:bg-gray-50",
  interview: "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
  rejected: "border-red-300 text-red-600 hover:bg-red-50",
  hold: "border-amber-300 text-amber-700 hover:bg-amber-50",
};

const BUTTON_LABELS: Record<string, string> = {
  applied: "Reset",
  interview: "Interview",
  rejected: "Reject",
  hold: "Hold",
};

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

  const statuses = ["interview", "hold", "rejected"] as const;

  return (
    <>
      {currentStatus !== "applied" && (
        <button
          onClick={handleReset}
          disabled={resetting}
          className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${BUTTON_STYLES.applied} disabled:opacity-50`}
        >
          {resetting ? "..." : BUTTON_LABELS.applied}
        </button>
      )}
      {statuses.map((status) => {
        if (currentStatus === status) return null;
        return (
          <button
            key={status}
            onClick={() => setModalStatus(status)}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${BUTTON_STYLES[status]}`}
          >
            {BUTTON_LABELS[status]}
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
