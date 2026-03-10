"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const parishes = [
  "All Locations",
  "St. John's",
  "All Saints",
  "St. George",
  "St. Peter",
  "St. Philip",
  "St. Paul",
  "St. Mary",
  "English Harbour",
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
    <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto">
      <div className="flex flex-col sm:flex-row bg-white rounded-full shadow-xl shadow-black/10 overflow-hidden border border-white/20">
        {/* Keyword input */}
        <div className="flex items-center flex-1 px-5 py-3.5 sm:py-3.5">
          <svg
            className="h-4.5 w-4.5 text-[#a1a1aa] shrink-0 mr-3"
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
            className="w-full bg-transparent text-[#1a1a1a] placeholder:text-[#a1a1aa] outline-none text-[15px]"
          />
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px bg-[#e7e5e0] my-2.5" />

        {/* Location dropdown */}
        <div className="flex items-center px-5 py-3.5 sm:py-3.5 border-t sm:border-t-0 border-[#f0ede8] sm:w-44">
          <svg
            className="h-4.5 w-4.5 text-[#a1a1aa] shrink-0 mr-3"
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
            className="w-full bg-transparent text-[#1a1a1a] outline-none text-[15px] appearance-none cursor-pointer"
          >
            {parishes.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Search button */}
        <button
          type="submit"
          className="bg-[#0d7377] hover:bg-[#095355] text-white font-semibold px-6 py-3.5 transition-colors text-[15px] cursor-pointer sm:rounded-r-full"
        >
          Search
        </button>
      </div>
    </form>
  );
}
