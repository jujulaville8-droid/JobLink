"use client";

import Link from "next/link";
import { useState } from "react";

export interface Job {
  id: string;
  title: string;
  company_name: string;
  company_logo?: string | null;
  location: string;
  job_type: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_visible?: boolean;
  created_at: string;
  is_featured?: boolean;
  is_pro_company?: boolean;
}

function isNew(dateStr: string): boolean {
  const created = new Date(dateStr);
  const now = new Date();
  return now.getTime() - created.getTime() < 24 * 60 * 60 * 1000;
}

function formatSalary(min?: number | null, max?: number | null): string {
  if (!min && !max) return "";
  const fmt = (n: number) =>
    n >= 1000 ? `EC$${(n / 1000).toFixed(0)}k` : `EC$${n}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

const JOB_TYPE_STYLES: Record<string, { color: string; label: string }> = {
  full_time: { color: "bg-emerald-50 text-emerald-700 border border-emerald-200", label: "Full Time" },
  part_time: { color: "bg-primary/5 text-primary border border-primary/20", label: "Part Time" },
  contract: { color: "bg-accent-warm/10 text-amber-700 border border-accent-warm/20", label: "Contract" },
  seasonal: { color: "bg-coral/10 text-orange-700 border border-coral/20", label: "Seasonal" },
};

function getJobType(type: string): { color: string; label: string } {
  return JOB_TYPE_STYLES[type] ?? { color: "bg-bg-alt text-text-light border border-border", label: type };
}

export default function JobCard({ job, isSaved = false, loggedIn = false }: { job: Job; isSaved?: boolean; loggedIn?: boolean }) {
  const [saved, setSaved] = useState(isSaved);
  const [savingBookmark, setSavingBookmark] = useState(false);

  async function toggleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!loggedIn) return;
    setSavingBookmark(true);
    try {
      const res = await fetch("/api/jobs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setSaved(data.saved);
      }
    } finally {
      setSavingBookmark(false);
    }
  }
  const initial = job.company_name.charAt(0).toUpperCase();
  const salary =
    job.salary_visible !== false
      ? formatSalary(job.salary_min, job.salary_max)
      : "";

  const colors = [
    "bg-primary",
    "bg-primary-dark",
    "bg-emerald-600",
    "bg-violet-600",
    "bg-sky-600",
    "bg-purple-600",
  ];
  const colorIndex =
    job.company_name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) %
    colors.length;

  const whatsappText = encodeURIComponent(
    `Check out this job: ${job.title} at ${job.company_name} — https://joblinkantigua.com/jobs/${job.id}`
  );

  const isFeatured = job.is_featured || job.is_pro_company;

  return (
    <div className={`group relative rounded-[--radius-card] transition-all duration-300 p-5 hover-lift ${
      isFeatured
        ? "bg-gradient-to-br from-amber-50/80 to-white border-2 border-amber-300/60 shadow-md shadow-amber-100/50 ring-1 ring-amber-200/30"
        : "bg-white border border-border hover:border-primary/20"
    }`}>
      <Link href={`/jobs/${job.id}`} className="block">
        <div className="flex items-start gap-3.5">
          {job.company_logo ? (
            <img
              src={job.company_logo}
              alt={job.company_name}
              className="shrink-0 h-11 w-11 rounded-xl object-cover border border-border"
            />
          ) : (
            <div
              className={`shrink-0 h-11 w-11 rounded-xl ${colors[colorIndex]} flex items-center justify-center text-white font-semibold text-sm`}
            >
              {initial}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-text group-hover:text-primary transition-colors text-[14px] leading-snug min-w-0">
                {job.title}
              </h3>
              {isFeatured && (
                <span className="shrink-0 bg-gradient-to-r from-amber-400 to-amber-500 text-white text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full tracking-wider shadow-sm shadow-amber-300/40">
                  Featured
                </span>
              )}
              {isNew(job.created_at) && !isFeatured && (
                <span className="shrink-0 bg-coral text-white text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                  New
                </span>
              )}
            </div>
            <p className="text-text-muted text-[13px] mt-0.5">{job.company_name}</p>

            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <span className="flex items-center gap-1 text-xs text-text-light">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {job.location}
              </span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${getJobType(job.job_type).color}`}>
                {getJobType(job.job_type).label}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 mt-2.5">
              {salary ? (
                <p className="flex-1 min-w-0 text-[13px] font-semibold text-text truncate">
                  {salary}
                  <span className="text-text-muted font-normal text-[11px] ml-1">/mo</span>
                </p>
              ) : (
                <p className="flex-1 min-w-0 text-[12px] text-text-muted italic truncate">
                  Salary discussed after application
                </p>
              )}

              <div className="flex items-center gap-2.5 shrink-0">
                {loggedIn && (
                  <button
                    onClick={toggleSave}
                    disabled={savingBookmark}
                    className={`cursor-pointer transition-colors ${saved ? "text-primary" : "text-border hover:text-primary"} disabled:opacity-50`}
                    aria-label={saved ? "Unsave job" : "Save job"}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                )}
                <a
                  href={`https://wa.me/?text=${whatsappText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-border hover:text-green-600 transition-colors"
                  aria-label="Share on WhatsApp"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
