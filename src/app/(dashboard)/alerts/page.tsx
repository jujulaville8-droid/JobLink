"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { INDUSTRIES, JOB_TYPE_LABELS, JobType } from "@/lib/types";

interface JobAlert {
  id: string;
  keywords: string[];
  industry: string | null;
  job_type: string | null;
  created_at: string;
}

const JOB_TYPES: { value: JobType; label: string }[] = Object.entries(
  JOB_TYPE_LABELS
).map(([value, label]) => ({ value: value as JobType, label }));

export default function AlertsPage() {
  const { user: authUser, isLoading: authLoading } = useAuth();
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [seekerProfileId, setSeekerProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [industry, setIndustry] = useState("");
  const [jobType, setJobType] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadAlerts = useCallback(async (profileId: string) => {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("job_alerts")
      .select("*")
      .eq("seeker_id", profileId)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError("Failed to load alerts. Please try again.");
      return;
    }
    setAlerts(data || []);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setError("Please sign in to manage job alerts.");
      setLoading(false);
      return;
    }

    async function init() {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from("seeker_profiles")
        .select("id")
        .eq("user_id", authUser!.id)
        .maybeSingle();

      if (!profile) {
        setError("Please complete your profile first to set up job alerts.");
        setLoading(false);
        return;
      }

      setSeekerProfileId(profile.id);
      await loadAlerts(profile.id);
      setLoading(false);
    }

    init();
  }, [authLoading, authUser, loadAlerts]);

  const resetForm = () => {
    setKeywordInput("");
    setKeywords([]);
    setIndustry("");
    setJobType("");
    setFormError(null);
  };

  const handleAddKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords((prev) => [...prev, kw]);
    }
    setKeywordInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleCreate = async () => {
    if (!seekerProfileId) return;
    if (keywords.length === 0 && !industry && !jobType) {
      setFormError("Please add at least one keyword, industry, or job type.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const supabase = createClient();
    const { error: insertError } = await supabase.from("job_alerts").insert({
      seeker_id: seekerProfileId,
      keywords: keywords.length > 0 ? keywords : null,
      industry: industry || null,
      job_type: jobType || null,
    });

    if (insertError) {
      setFormError("Failed to create alert. Please try again.");
      setSaving(false);
      return;
    }

    await loadAlerts(seekerProfileId);
    resetForm();
    setShowForm(false);
    setSaving(false);
  };

  const handleDelete = async (alertId: string) => {
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("job_alerts")
      .delete()
      .eq("id", alertId);

    if (deleteError) {
      setError("Failed to delete alert.");
      return;
    }

    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#0d7377]" />
      </div>
    );
  }

  if (error && !seekerProfileId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Job Alerts</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Alerts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Get notified when new jobs match your criteria
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[#0d7377] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#095355] transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-[#0d7377]/20"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Alert
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Create Alert Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Create a new alert</h2>

          <div className="space-y-4">
            {/* Keywords */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Keywords
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. marketing, chef, IT support"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0d7377] focus:ring-1 focus:ring-[#0d7377] outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Add
                </button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
                    >
                      {kw}
                      <button
                        onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Industry */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Industry
              </label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-[#0d7377] focus:ring-1 focus:ring-[#0d7377] outline-none"
              >
                <option value="">Any industry</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>

            {/* Job Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Job Type
              </label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-[#0d7377] focus:ring-1 focus:ring-[#0d7377] outline-none"
              >
                <option value="">Any type</option>
                {JOB_TYPES.map((jt) => (
                  <option key={jt.value} value={jt.value}>{jt.label}</option>
                ))}
              </select>
            </div>

            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="rounded-[10px] bg-[#0d7377] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#095355] disabled:opacity-60 transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-[#0d7377]/20"
              >
                {saving ? "Creating..." : "Create Alert"}
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(false); }}
                className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No alerts yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create an alert to get notified when new jobs match your criteria.
          </p>
          {!showForm && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-[#0d7377] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#095355] transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-[#0d7377]/20"
            >
              Create your first alert
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0d7377]/10 flex-shrink-0">
                <svg className="h-5 w-5 text-[#0d7377]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  {alert.keywords && alert.keywords.length > 0 && alert.keywords.map((kw) => (
                    <span key={kw} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {kw}
                    </span>
                  ))}
                  {alert.industry && (
                    <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      {alert.industry}
                    </span>
                  )}
                  {alert.job_type && (
                    <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                      {JOB_TYPE_LABELS[alert.job_type as JobType] || alert.job_type}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  Created {new Date(alert.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>

              <button
                onClick={() => handleDelete(alert.id)}
                className="flex-shrink-0 rounded-lg p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Delete alert"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
