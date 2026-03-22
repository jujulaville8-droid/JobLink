"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

interface Listing {
  id: string;
  title: string;
}

export default function InviteToApplyButton({
  candidateName,
  candidateUserId,
}: {
  candidateName: string;
  candidateUserId: string;
}) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const autoOpen = searchParams.get("invite") === "true";

  const [open, setOpen] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedListing, setSelectedListing] = useState<string>("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-open if ?invite=true
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  // Fetch employer's active listings when modal opens
  useEffect(() => {
    if (!open || !user) return;

    async function fetchListings() {
      const supabase = createClient();
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user!.id)
        .single();

      if (!company) return;

      const { data } = await supabase
        .from("job_listings")
        .select("id, title")
        .eq("company_id", company.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (data) {
        setListings(data);
        if (data.length === 1) setSelectedListing(data[0].id);
      }
    }

    fetchListings();
  }, [open, user]);

  // Build default message when listing is selected
  useEffect(() => {
    if (!selectedListing) {
      setMessage("");
      return;
    }
    const listing = listings.find((l) => l.id === selectedListing);
    if (listing) {
      setMessage(
        `Hi ${candidateName.split(" ")[0]},\n\nI came across your profile and think you'd be a great fit for our "${listing.title}" position. We'd love for you to apply!\n\nYou can view and apply for the role here: ${window.location.origin}/jobs/${listing.id}\n\nLooking forward to hearing from you.`
      );
    }
  }, [selectedListing, listings, candidateName]);

  async function handleSend() {
    if (!selectedListing || !message.trim()) return;
    setSending(true);
    setError(null);

    try {
      // Send as a direct message via the messaging API
      const res = await fetch("/api/messages/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_user_id: candidateUserId,
          listing_id: selectedListing,
          body: message.trim(),
        }),
      });

      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to send invitation.");
      }
    } catch {
      setError("Something went wrong.");
    }

    setSending(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-accent-warm px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-warm-hover transition-colors"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
        Invite to Apply
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget && !sending) setOpen(false); }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white border border-border shadow-xl p-6 animate-scale-in">
            {sent ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="h-7 w-7 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-text">Invitation Sent</h3>
                <p className="mt-1 text-sm text-text-light">
                  {candidateName} has been invited to apply. They&apos;ll receive your message in their inbox.
                </p>
                <button
                  onClick={() => { setOpen(false); setSent(false); }}
                  className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold font-display text-text">
                  Invite {candidateName.split(" ")[0]} to Apply
                </h3>
                <p className="mt-1 text-sm text-text-light">
                  Select a listing and send a personalized invitation.
                </p>

                {error && (
                  <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    {error}
                  </div>
                )}

                {/* Listing selector */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-text-light mb-1.5">
                    Select a listing
                  </label>
                  {listings.length === 0 ? (
                    <p className="text-sm text-text-muted">
                      You don&apos;t have any active listings.{" "}
                      <a href="/post-job" className="text-primary font-medium hover:underline">Post a job</a> first.
                    </p>
                  ) : (
                    <select
                      value={selectedListing}
                      onChange={(e) => setSelectedListing(e.target.value)}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    >
                      <option value="">Choose a listing...</option>
                      {listings.map((l) => (
                        <option key={l.id} value={l.id}>{l.title}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Message */}
                {selectedListing && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-text-light mb-1.5">
                      Message
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={6}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 resize-none"
                    />
                    <p className="mt-1 text-[11px] text-text-muted">
                      You can edit this message before sending.
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setOpen(false)}
                    disabled={sending}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg-alt transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending || !selectedListing || !message.trim()}
                    className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send Invitation"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
