"use client";

import Link from "next/link";

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
}

function isNew(dateStr: string): boolean {
  const created = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return diffMs < 24 * 60 * 60 * 1000;
}

function formatSalary(min?: number | null, max?: number | null): string {
  if (!min && !max) return "";
  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

function jobTypeBadgeColor(type: string): string {
  switch (type.toLowerCase()) {
    case "full-time":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "part-time":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "contract":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "seasonal":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "temporary":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

export default function JobCard({ job }: { job: Job }) {
  const initial = job.company_name.charAt(0).toUpperCase();
  const salary =
    job.salary_visible !== false
      ? formatSalary(job.salary_min, job.salary_max)
      : "";

  // Deterministic color from company name
  const colors = [
    "bg-[#0f2b4c]",
    "bg-[#e85d26]",
    "bg-emerald-600",
    "bg-violet-600",
    "bg-rose-600",
    "bg-cyan-600",
  ];
  const colorIndex =
    job.company_name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) %
    colors.length;

  const whatsappText = encodeURIComponent(
    `Check out this job: ${job.title} at ${job.company_name} — https://joblink.ag/jobs/${job.id}`
  );

  return (
    <div className="group relative bg-white rounded-xl border border-gray-100 hover:border-[#0f2b4c]/20 hover:shadow-lg transition-all p-5">
      {/* Featured ribbon */}
      {job.is_featured && (
        <div className="absolute top-3 right-3 bg-[#d4a843] text-white text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full tracking-wide">
          Featured
        </div>
      )}

      {/* New badge */}
      {isNew(job.created_at) && !job.is_featured && (
        <div className="absolute top-3 right-3 bg-emerald-500 text-white text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full tracking-wide">
          New
        </div>
      )}

      <Link href={`/jobs/${job.id}`} className="block">
        <div className="flex items-start gap-4">
          {/* Company logo / initial */}
          {job.company_logo ? (
            <img
              src={job.company_logo}
              alt={job.company_name}
              className="shrink-0 h-12 w-12 rounded-xl object-cover border border-gray-100"
            />
          ) : (
            <div
              className={`shrink-0 h-12 w-12 rounded-xl ${colors[colorIndex]} flex items-center justify-center text-white font-bold text-lg`}
            >
              {initial}
            </div>
          )}

          <div className="min-w-0 flex-1">
            {/* Title */}
            <h3 className="font-semibold text-gray-900 group-hover:text-[#0f2b4c] transition-colors text-[15px] leading-snug">
              {job.title}
            </h3>

            {/* Company */}
            <p className="text-gray-500 text-sm mt-0.5">{job.company_name}</p>

            {/* Location + type */}
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <svg
                  className="h-3.5 w-3.5"
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
                {job.location}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${jobTypeBadgeColor(job.job_type)}`}
              >
                {job.job_type}
              </span>
            </div>

            {/* Salary */}
            {salary && (
              <p className="text-sm font-semibold text-[#0f2b4c] mt-2.5">
                {salary}
                <span className="text-gray-400 font-normal text-xs ml-1">/month</span>
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* WhatsApp share */}
      <a
        href={`https://wa.me/?text=${whatsappText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-4 right-4 text-gray-300 hover:text-green-600 transition-colors"
        aria-label="Share on WhatsApp"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </div>
  );
}
