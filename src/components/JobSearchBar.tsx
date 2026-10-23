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
    params.delete("job");
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
    params.delete("job");
    params.delete("q");
    router.push(`/jobs?${params.toString()}`);
  }

  function handleClearLocation() {
    setLocation("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("job");
    params.delete("location");
    router.push(`/jobs?${params.toString()}`);
  }

  const clearButton = "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-gray-100 transition-colors";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 lg:flex-row lg:items-center" role="search" aria-label="Find jobs">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-white transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center sm:flex-[1.4]">
          <svg
            className="ml-4 h-5 w-5 shrink-0 text-text-light pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            aria-label="Search jobs by title, keyword, or company"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Job title, keyword, or company"
            className="min-h-13 w-full min-w-0 bg-transparent px-3 text-[0.9375rem] text-text placeholder:text-text-muted focus:outline-none"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={handleClear} className={clearButton}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <span aria-hidden="true" className="mx-4 h-px bg-border sm:mx-0 sm:h-7 sm:w-px" />
        <div className="flex min-w-0 items-center sm:flex-1">
          <svg className="ml-4 h-5 w-5 shrink-0 text-text-light pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <label htmlFor={locationId} className="sr-only">Job location</label>
          <input id={locationId} type="text" value={location} onChange={event => setLocation(event.target.value)}
            placeholder="Town or area" aria-describedby={`${locationId}-hint`}
            className="min-h-13 w-full min-w-0 bg-transparent px-3 text-[0.9375rem] text-text placeholder:text-text-muted focus:outline-none" />
          {location && <button type="button" aria-label="Clear location" onClick={handleClearLocation} className={clearButton}>×</button>}
        </div>
      </div>
      <button
        type="submit"
        className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-primary px-8 text-base font-semibold text-white hover:bg-primary-dark transition-colors"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        Search
      </button>
      <p id={`${locationId}-hint`} className="text-xs text-text-light lg:max-w-[13rem] lg:border-l lg:border-border lg:pl-5">
        Searches the location recorded on each job.
      </p>
    </form>
  );
}
