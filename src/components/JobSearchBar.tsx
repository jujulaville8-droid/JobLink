"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

export default function JobSearchBar(props: { defaultValue?: string; defaultLocation?: string }) {
  const params = useSearchParams();
  return <SearchFields key={JSON.stringify([params.get("q") ?? props.defaultValue, params.get("location") ?? props.defaultLocation])} {...props} />;
}

function SearchFields({ defaultValue, defaultLocation }: { defaultValue?: string; defaultLocation?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? defaultValue ?? "");
  const [location, setLocation] = useState(searchParams.get("location") ?? defaultLocation ?? "");
  const locationId = useId();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }
    const normalizedLocation = location.trim().replace(/\s+/g, " ");
    if (normalizedLocation) params.set("location", normalizedLocation);
    else params.delete("location");
    router.push(`/jobs?${params.toString()}`);
  }

  function handleClear() {
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("q");
    router.push(`/jobs?${params.toString()}`);
  }

  function handleClearLocation() {
    setLocation("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("location");
    router.push(`/jobs?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3" role="search" aria-label="Find jobs">
      <div className="sm:flex-[2] min-w-0">
        <div className="relative flex items-center">
          <svg
            className="absolute left-3.5 h-4 w-4 text-text-muted pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            aria-label="Search jobs by title, keyword, or company"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by job title, keyword, or company..."
            className="min-h-11 w-full rounded-xl border border-border bg-white py-2.5 pl-10 pr-32 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
          />
          <div className="absolute right-1.5 flex items-center gap-1">
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={handleClear}
                className="flex items-center justify-center h-11 w-11 rounded-lg text-text-muted hover:text-text hover:bg-gray-100 transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              className="rounded-lg bg-primary min-h-11 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors"
            >
              Search
            </button>
          </div>
        </div>
      </div>
      <div className="sm:flex-1 min-w-0">
        <label htmlFor={locationId} className="sr-only">Job location</label>
        <div className="relative">
          <input id={locationId} type="text" value={location} onChange={event => setLocation(event.target.value)}
            placeholder="Town or area" aria-describedby={`${locationId}-hint`}
            className="input-base pr-12" />
          {location && <button type="button" aria-label="Clear location" onClick={handleClearLocation}
            className="absolute right-1 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-text-light hover:bg-gray-100">×</button>}
        </div>
        <p id={`${locationId}-hint`} className="mt-1 text-xs text-text-light">Searches the location recorded on each job.</p>
      </div>
    </form>
  );
}
