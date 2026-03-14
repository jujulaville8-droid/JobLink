"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MessageButtonProps {
  applicationId: string;
  label?: string;
  className?: string;
  variant?: "primary" | "outline";
}

export default function MessageButton({
  applicationId,
  label = "Message",
  className = "",
  variant = "outline",
}: MessageButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch(
        `/api/messages/conversations/by-application?application_id=${applicationId}`
      );

      if (res.ok) {
        const { conversation_id } = await res.json();
        if (conversation_id) {
          router.push(`/messages/${conversation_id}`);
        } else {
          router.push(`/messages/new?application_id=${applicationId}`);
        }
      } else {
        router.push(`/messages/new?application_id=${applicationId}`);
      }
    } catch {
      router.push(`/messages/new?application_id=${applicationId}`);
    } finally {
      setLoading(false);
    }
  }

  const baseStyles = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0";

  const variantStyles =
    variant === "primary"
      ? "bg-primary text-white hover:bg-primary-dark hover:shadow-md hover:shadow-primary/20"
      : "border border-primary/30 text-primary hover:bg-primary hover:text-white hover:shadow-md hover:shadow-primary/20";

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`${baseStyles} ${variantStyles} ${className}`}
    >
      {loading ? (
        <div className="h-3 w-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      )}
      {label}
    </button>
  );
}
