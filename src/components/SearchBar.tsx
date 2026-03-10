"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const parishes = [
  "All Locations",
  "St. John's",
  "St. George",
  "St. Peter",
  "St. Philip",
  "St. Paul",
  "St. Mary",
  "All Saints",
  "Barbuda",
];

export default function SearchBar() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("All Locations");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    if (location !== "All Locations") params.set("location", location);
    router.push(`/jobs?${params.toString()}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-3xl mx-auto"
    >
      <div className="flex flex-col sm:flex-row bg-white rounded-xl shadow-lg border border-border overflow-hidden">
        {/* Keyword input */}
        <div className="flex items-center flex-1 px-4 py-3 sm:py-4 border-b sm:border-b-0 sm:border-r border-border">
          <svg
            className="h-5 w-5 text-text-light shrink-0 mr-3"
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
            placeholder="Job title or keyword..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full bg-transparent text-text placeholder:text-text-light outline-none text-sm sm:text-base"
          />
        </div>

        {/* Location dropdown */}
        <div className="flex items-center px-4 py-3 sm:py-4 border-b sm:border-b-0 sm:border-r border-border sm:w-52">
          <svg
            className="h-5 w-5 text-text-light shrink-0 mr-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-transparent text-text outline-none text-sm sm:text-base appearance-none cursor-pointer"
          >
            {parishes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Search button */}
        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white font-semibold px-6 py-3 sm:py-4 transition-colors text-sm sm:text-base cursor-pointer"
        >
          Search Jobs
        </button>
      </div>
    </form>
  );
}
