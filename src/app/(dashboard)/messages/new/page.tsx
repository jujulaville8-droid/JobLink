"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import ComposeBox from "@/components/messaging/ComposeBox";
import TemplateDrawer from "@/components/messaging/TemplateDrawer";

interface ApplicationContext {
  job_title: string;
  company_name: string;
  other_name: string;
}

export default function NewConversationPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("application_id");

  const [context, setContext] = useState<ApplicationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [composeValue, setComposeValue] = useState("");

  useEffect(() => {
    if (authLoading || !user || !applicationId) return;

    async function init() {
      // Check if a conversation already exists — if so, redirect into it
      try {
        const lookupRes = await fetch(
          `/api/messages/conversations/by-application?application_id=${applicationId}`
        );
        if (lookupRes.ok) {
          const { conversation_id } = await lookupRes.json();
          if (conversation_id) {
            router.replace(`/messages/${conversation_id}`);
            return;
          }
        }
      } catch { /* continue to show compose */ }

      // Fetch application context for the header
      try {
        const res = await fetch(`/api/applications/${applicationId}/context`);
        if (res.ok) {
          setContext(await res.json());
        } else if (res.status === 404) {
          setError("Application not found.");
        } else if (res.status === 403) {
          setError("You don't have access to this application.");
        }
      } catch { /* ignore */ }

      setLoading(false);
    }

    init();
  }, [user, authLoading, applicationId, router]);

  async function handleSend(body: string) {
    const res = await fetch("/api/messages/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_id: applicationId, body }),
    });

    if (res.ok) {
      const { conversation_id } = await res.json();
      router.replace(`/messages/${conversation_id}`);
    }
  }

  function handleTemplateInsert(templateBody: string) {
    setShowTemplates(false);
    setComposeValue(templateBody);
  }

  if (!applicationId) {
    return (
      <div className="mt-16 text-center">
        <h2 className="text-lg font-semibold text-text">Invalid link</h2>
        <p className="mt-1 text-sm text-text-light">
          This page requires a valid application context.
        </p>
        <Link
          href="/messages"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-white transition-all duration-200"
        >
          Go to Messages
        </Link>
      </div>
    );
  }

  if (loading || authLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-10rem)]">
        <div className="p-4 border-b border-border">
          <div className="h-5 w-40 skeleton rounded" />
          <div className="h-3 w-60 skeleton rounded mt-2" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-16 text-center">
        <h2 className="text-lg font-semibold text-text">Error</h2>
        <p className="mt-1 text-sm text-text-light">{error}</p>
        <Link
          href="/messages"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-white transition-all duration-200"
        >
          Go to Messages
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-white">
        <Link
          href="/messages"
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-border text-text-light hover:border-primary/30 hover:text-primary transition-all duration-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text truncate">
            {context?.other_name || "New Conversation"}
          </h2>
          {context && (
            <p className="text-xs text-text-muted truncate">
              Re: {context.job_title} at {context.company_name}
            </p>
          )}
        </div>
      </div>

      {/* Empty message area */}
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5 mb-3">
            <svg className="h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <p className="text-sm text-text-light">
            Send the first message to start the conversation.
          </p>
        </div>
      </div>

      {/* Compose */}
      <div className="relative">
        {showTemplates && (
          <TemplateDrawer
            onSelect={handleTemplateInsert}
            onClose={() => setShowTemplates(false)}
          />
        )}
        <ComposeBox
          onSend={handleSend}
          onTemplateToggle={() => setShowTemplates(!showTemplates)}
          externalValue={composeValue}
          onExternalValueConsumed={() => setComposeValue("")}
        />
      </div>
    </div>
  );
}
