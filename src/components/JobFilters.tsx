"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { INDUSTRIES, JOB_TYPE_LABELS, JobType } from "@/lib/types";

const JOB_TYPES: { value: JobType; label: string }[] = Object.entries(
  JOB_TYPE_LABELS
).map(([value, label]) => ({ value: value as JobType, label }));

export default function JobFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const currentCategory = searchParams.get("category") || "";
  const currentJobTypes = searchParams.getAll("job_type");
  const currentWorkPermit = searchParams.get("work_permit") === "true";

  function updateParams(updates: Record<string, string | string[] | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      params.delete(key);
      if (value === null || value === "") continue;
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else {
        params.set(key, value);
      }
    }

    router.push(`/jobs?${params.toString()}`);
  }

  function clearAll() {
    const params = new URLSearchParams();
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    router.push(`/jobs?${params.toString()}`);
  }

  function toggleJobType(type: string) {
    const types = new Set(currentJobTypes);
    if (types.has(type)) {
      types.delete(type);
    } else {
      types.add(type);
    }
    updateParams({ job_type: Array.from(types) });
  }

  const hasFilters =
    currentCategory || currentJobTypes.length > 0 || currentWorkPermit;

  const filterContent = (
    <div className="space-y-6">
      {/* Category */}
      <div>
        <label className="block text-sm font-semibold text-text mb-2">
          Industry / Category
        </label>
        <select
          value={currentCategory}
          onChange={(e) => updateParams({ category: e.target.value || null })}
          className="input-base"
        >
          <option value="">All Industries</option>
          {INDUSTRIES.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </div>

      {/* Job Type */}
      <div>
        <label className="block text-sm font-semibold text-text mb-2">
          Job Type
        </label>
        <div className="space-y-2">
          {JOB_TYPES.map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={currentJobTypes.includes(value)}
                onChange={() => toggleJobType(value)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
              />
              <span className="text-sm text-text">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Work Permit */}
      <div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={currentWorkPermit}
            onChange={() =>
              updateParams({ work_permit: currentWorkPermit ? null : "true" })
            }
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
          />
          <span className="text-sm text-text">Requires work permit</span>
        </label>
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
                {
                  [currentCategory, ...currentJobTypes, currentWorkPermit ? "wp" : ""].filter(Boolean).length
                }
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
