import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import CandidateFilters from "@/components/CandidateFilters";
import CandidateProfileCard from "@/components/ui/info-card";
import { Suspense } from "react";

interface PageProps {
  searchParams: Promise<{
    q?: string;
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
    min_exp?: string;
    max_exp?: string;
    skills?: string;
  };
}) {
  const supabase = await createClient();

  let query = supabase
    .from("seeker_profiles")
    .select("*")
    .eq("visibility", "actively_looking")
    .gte("profile_complete_pct", 30)
    .not("first_name", "is", null)
    .neq("first_name", "")
    .not("last_name", "is", null)
    .neq("last_name", "")
    .order("updated_at", { ascending: false });

  if (searchParams.q) {
    const keyword = `%${searchParams.q}%`;
    query = query.or(
      `first_name.ilike.${keyword},last_name.ilike.${keyword},bio.ilike.${keyword}`
    );
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((profile) => {
          const fullName = [profile.first_name, profile.last_name]
            .filter(Boolean)
            .join(" ") || "Unnamed";
          const skills = (profile.skills || []).slice(0, 4);

          return (
            <CandidateProfileCard
              key={profile.id}
              id={profile.id}
              name={fullName}
              role={profile.bio?.slice(0, 50) || "Job Seeker"}
              status={profile.visibility}
              avatar={profile.avatar_url}
              tags={skills}
              location={profile.location}
              experienceYears={profile.experience_years}
              bio={profile.bio}
              education={profile.education}
              userId={profile.user_id}
            />
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
            className="input-base"
            style={{ paddingLeft: "2.75rem" }}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-3xl bg-white p-6 shadow-[8px_8px_16px_rgba(0,0,0,0.08),-8px_-8px_16px_rgba(255,255,255,0.9)]"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-24 w-24 rounded-full skeleton" />
                      <div className="h-4 w-2/3 rounded skeleton" />
                      <div className="h-3 w-1/2 rounded skeleton" />
                      <div className="h-3 w-1/3 rounded skeleton" />
                      <div className="flex gap-2 mt-2 w-full">
                        <div className="flex-1 h-10 rounded-full skeleton" />
                        <div className="flex-1 h-10 rounded-full skeleton" />
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
