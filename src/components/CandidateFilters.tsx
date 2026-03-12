"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ANTIGUA_PARISHES } from "@/lib/types";

export default function CandidateFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const currentLocation = searchParams.get("location") || "";
  const currentMinExp = searchParams.get("min_exp") || "";
  const currentMaxExp = searchParams.get("max_exp") || "";
  const currentSkills = searchParams.get("skills") || "";

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      params.delete(key);
      if (value === null || value === "") continue;
      params.set(key, value);
    }

    router.push(`/browse-candidates?${params.toString()}`);
  }

  function clearAll() {
    const params = new URLSearchParams();
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    router.push(`/browse-candidates?${params.toString()}`);
  }

  const hasFilters =
    currentLocation || currentMinExp || currentMaxExp || currentSkills;

  const filterContent = (
    <div className="space-y-6">
      {/* Location */}
      <div>
        <label className="block text-sm font-semibold text-text mb-2">
          Location
        </label>
        <select
          value={currentLocation}
          onChange={(e) => updateParams({ location: e.target.value || null })}
          className="input-base"
        >
          <option value="">All Locations</option>
          {ANTIGUA_PARISHES.map((parish) => (
            <option key={parish} value={parish}>
              {parish}
            </option>
          ))}
        </select>
      </div>

      {/* Experience Range */}
      <div>
        <label className="block text-sm font-semibold text-text mb-2">
          Experience (years)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            value={currentMinExp}
            onChange={(e) => updateParams({ min_exp: e.target.value || null })}
            className="input-base flex-1"
          />
          <input
            type="number"
            min="0"
            placeholder="Max"
            value={currentMaxExp}
            onChange={(e) => updateParams({ max_exp: e.target.value || null })}
            className="input-base flex-1"
          />
        </div>
      </div>

      {/* Skills */}
      <div>
        <label className="block text-sm font-semibold text-text mb-2">
          Skills
        </label>
        <input
          type="text"
          placeholder="e.g. JavaScript, Excel"
          value={currentSkills}
          onChange={(e) => updateParams({ skills: e.target.value || null })}
          className="input-base"
        />
        <p className="mt-1 text-xs text-text-muted">
          Comma-separated. Matches candidates with any of these skills.
        </p>
      </div>

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="w-full rounded-[--radius-button] border border-border px-4 py-2.5 text-sm font-medium text-text-light hover:text-text hover:border-primary/30 transition-colors"
        >
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="lg:hidden mb-4">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-[--radius-button] border border-border bg-white px-4 py-3 text-sm font-medium text-text hover:border-primary/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-text-light"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="14" y2="12" />
              <line x1="4" y1="18" x2="10" y2="18" />
            </svg>
            Filters
            {hasFilters && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {[currentLocation, currentMinExp, currentMaxExp, currentSkills].filter(Boolean).length}
              </span>
            )}
          </span>
          <svg
            className={`h-5 w-5 text-text-light transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div className="mt-2 rounded-[--radius-button] border border-border bg-white p-4 animate-fade-up">
            {filterContent}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-20 rounded-[--radius-card] border border-border bg-white p-5">
          <h2 className="font-display text-base text-text mb-4">Filters</h2>
          {filterContent}
        </div>
      </aside>
    </>
  );
}
