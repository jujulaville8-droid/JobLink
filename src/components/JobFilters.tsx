"use client";

import { jobCategoryFilter } from "@/lib/job-category";
import { useId, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { INDUSTRIES, JOB_TYPE_LABELS, JobType } from "@/lib/types";

const JOB_TYPES: { value: JobType; label: string }[] = Object.entries(
  JOB_TYPE_LABELS
).map(([value, label]) => ({ value: value as JobType, label }));

// URLSearchParams encodes spaces as "+", while every other internal link
// (e.g. the homepage industry links) uses encodeURIComponent's "%20". Use one
// format so each category has a single URL. A literal "+" is already "%2B".
function toQuery(params: URLSearchParams): string {
  return params.toString().replace(/\+/g, "%20");
}

/** `bar`: the horizontal desktop row used on /jobs; `sidebar` (default) for /browse-jobs. */
export default function JobFilters({ layout = "sidebar" }: { layout?: "sidebar" | "bar" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const filterId = useId();

  const currentCategory = jobCategoryFilter(searchParams.get("category") || undefined) || "";
  const currentJobTypes = searchParams.getAll("job_type");

  function updateParams(updates: Record<string, string | string[] | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    // A new result set picks its own selection in the /jobs split view.
    params.delete("job");
    const category = jobCategoryFilter(params.get("category") || undefined);
    if (category) params.set("category", category);

    for (const [key, value] of Object.entries(updates)) {
      params.delete(key);
      if (value === null || value === "") continue;
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else {
        params.set(key, value);
      }
    }

    router.push(`${pathname}?${toQuery(params)}`);
  }

  function clearAll() {
    const params = new URLSearchParams();
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    router.push(`${pathname}?${toQuery(params)}`);
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
    currentCategory || currentJobTypes.length > 0;

  const filterContent = (surface: string) => (
    <div className="space-y-6">
      {/* Category */}
      <div>
        <label htmlFor={`${filterId}-${surface}-industry`} className="block text-sm font-semibold text-text mb-2">
          Industry / Category
        </label>
        <select
          id={`${filterId}-${surface}-industry`}
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
      <fieldset>
        <legend className="block text-sm font-semibold text-text mb-2">
          Job Type
        </legend>
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
      </fieldset>

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
          aria-expanded={open}
          aria-controls={`${filterId}-mobile`}
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
                  [currentCategory, ...currentJobTypes].filter(Boolean).length
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
          <div id={`${filterId}-mobile`} className="mt-2 rounded-[--radius-button] border border-border bg-white p-4 animate-fade-up">
            {filterContent("mobile")}
          </div>
        )}
      </div>

      {layout === "bar" ? (
        <div className="hidden lg:flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-5 mb-6">
          <div className="flex items-center gap-3">
            <label htmlFor={`${filterId}-bar-industry`} className="text-sm font-medium text-text whitespace-nowrap">
              Industry / Category
            </label>
            <select
              id={`${filterId}-bar-industry`}
              value={currentCategory}
              onChange={(e) => updateParams({ category: e.target.value || null })}
              className="input-base w-64"
            >
              <option value="">All Industries</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>
          <span aria-hidden="true" className="h-6 w-px bg-border" />
          <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <legend className="sr-only">Job Type</legend>
            <span aria-hidden="true" className="text-sm font-medium text-text">Job Type</span>
            {JOB_TYPES.map(({ value, label }) => (
              <label key={value} className="flex min-h-11 items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentJobTypes.includes(value)}
                  onChange={() => toggleJobType(value)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                />
                <span className="text-sm text-text-light">{label}</span>
              </label>
            ))}
          </fieldset>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="ml-auto min-h-11 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary-dark"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-20 rounded-[--radius-card] border border-border bg-white p-5">
          <h2 className="font-display text-base text-text mb-4">Filters</h2>
          {filterContent("desktop")}
        </div>
      </aside>
      )}
    </>
  );
}
