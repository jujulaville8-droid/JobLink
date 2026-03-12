import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import CandidateFilters from "@/components/CandidateFilters";
import Link from "next/link";
import { Suspense } from "react";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    location?: string;
    min_exp?: string;
    max_exp?: string;
    skills?: string;
  }>;
}

async function CandidateResults({
  searchParams,
}: {
  searchParams: {
    q?: string;
    location?: string;
    min_exp?: string;
    max_exp?: string;
    skills?: string;
  };
}) {
  const supabase = await createClient();

  let query = supabase
    .from("seeker_profiles")
    .select("*")
    .in("visibility", ["actively_looking", "open"])
    .gt("profile_complete_pct", 0)
    .order("updated_at", { ascending: false });

  if (searchParams.q) {
    const keyword = `%${searchParams.q}%`;
    query = query.or(
      `first_name.ilike.${keyword},last_name.ilike.${keyword},bio.ilike.${keyword}`
    );
  }

  if (searchParams.location) {
    query = query.eq("location", searchParams.location);
  }

  if (searchParams.min_exp) {
    query = query.gte("experience_years", parseInt(searchParams.min_exp));
  }

  if (searchParams.max_exp) {
    query = query.lte("experience_years", parseInt(searchParams.max_exp));
  }

  const { data: profiles, error } = await query;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">
          Something went wrong loading candidates.
        </p>
        <p className="text-sm text-red-500 mt-1">Please try again later.</p>
      </div>
    );
  }

  // Client-side skills filter (Supabase array contains is exact match only)
  let filtered = profiles || [];
  if (searchParams.skills) {
    const searchSkills = searchParams.skills
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (searchSkills.length > 0) {
      filtered = filtered.filter((p) =>
        p.skills?.some((skill: string) =>
          searchSkills.some((s) => skill.toLowerCase().includes(s))
        )
      );
    }
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-10 text-center">
        <svg
          className="mx-auto h-12 w-12 text-text-light/50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-text">
          No candidates found
        </h3>
        <p className="mt-1 text-sm text-text-light">
          Try adjusting your filters or search terms to find more candidates.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-text-light">
        <span className="font-semibold text-text">{filtered.length}</span>{" "}
        {filtered.length === 1 ? "candidate" : "candidates"} found
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((profile) => {
          const initial =
            (profile.first_name?.charAt(0) || "?").toUpperCase();
          const fullName = [profile.first_name, profile.last_name]
            .filter(Boolean)
            .join(" ") || "Unnamed";
          const skills = profile.skills || [];
          const visibleSkills = skills.slice(0, 4);
          const extraSkills = skills.length - 4;

          return (
            <Link
              key={profile.id}
              href={`/candidates/${profile.id}`}
              className="block rounded-xl border border-border bg-white p-5 hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white text-sm font-semibold shrink-0">
                    {initial}
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  {/* Name + badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-text truncate">
                      {fullName}
                    </h3>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        profile.visibility === "actively_looking"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {profile.visibility === "actively_looking"
                        ? "Actively Looking"
                        : "Open"}
                    </span>
                  </div>

                  {/* Location + experience */}
                  <div className="mt-1 flex items-center gap-3 text-sm text-text-light">
                    {profile.location && (
                      <span className="flex items-center gap-1">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {profile.location}
                      </span>
                    )}
                    {profile.experience_years != null && (
                      <span>
                        {profile.experience_years}{" "}
                        {profile.experience_years === 1 ? "yr" : "yrs"} exp
                      </span>
                    )}
                  </div>

                  {/* Skills */}
                  {visibleSkills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {visibleSkills.map((skill: string) => (
                        <span
                          key={skill}
                          className="inline-block rounded-full bg-bg-alt px-2.5 py-0.5 text-[11px] font-medium text-text-light"
                        >
                          {skill}
                        </span>
                      ))}
                      {extraSkills > 0 && (
                        <span className="inline-block rounded-full bg-bg-alt px-2.5 py-0.5 text-[11px] font-medium text-text-muted">
                          +{extraSkills} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function BrowseCandidatesPage({
  searchParams,
}: PageProps) {
  await requireRole("employer");
  const params = await searchParams;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display text-text">
          Browse Candidates
        </h1>
        <p className="mt-1 text-sm text-text-light">
          Discover talent across Antigua and Barbuda
        </p>
      </div>

      {/* Search bar */}
      <form className="mb-6">
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted"
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
            name="q"
            defaultValue={params.q || ""}
            placeholder="Search by name, skills, or bio..."
            className="input-base pl-11"
          />
        </div>
      </form>

      {params.q && (
        <div className="mb-4">
          <p className="text-sm text-text-light">
            Results for{" "}
            <span className="font-semibold text-text">
              &ldquo;{params.q}&rdquo;
            </span>
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <Suspense fallback={null}>
          <CandidateFilters />
        </Suspense>

        <div className="flex-1 min-w-0">
          <Suspense
            fallback={
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-xl border border-border bg-white p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-full skeleton" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 rounded skeleton" />
                        <div className="h-3 w-1/2 rounded skeleton" />
                        <div className="h-3 w-1/3 rounded skeleton" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            }
          >
            <CandidateResults searchParams={params} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
