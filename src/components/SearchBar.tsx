"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchBar() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("q", keyword.trim());
    router.push(`/jobs?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row bg-white rounded-2xl sm:rounded-[14px] shadow-xl shadow-black/10 overflow-hidden border border-white/20">
        {/* Search input */}
        <div className="flex items-center flex-1 px-5 py-3.5">
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
            placeholder="Search jobs, skills, or companies"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full bg-transparent text-[#1a1a1a] placeholder:text-[#a1a1aa] outline-none text-[15px]"
          />
        </div>

        {/* Search button */}
        <button
          type="submit"
          className="bg-[#0d7377] hover:bg-[#095355] text-white font-semibold px-8 py-3.5 transition-all duration-200 text-[15px] cursor-pointer sm:rounded-r-[14px] hover:shadow-md hover:shadow-[#0d7377]/20"
        >
          Search Jobs
        </button>
      </div>
    </form>
  );
}
