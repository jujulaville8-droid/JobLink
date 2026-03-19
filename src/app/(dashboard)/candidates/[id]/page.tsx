import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import InviteToApplyButton from "@/components/InviteToApplyButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CandidateProfilePage({ params }: PageProps) {
  await requireRole("employer");
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("seeker_profiles")
    .select("*")
    .eq("id", id)
    .in("visibility", ["actively_looking", "open"])
    .single();

  if (!profile) {
    redirect("/browse-candidates");
  }

  const initial = (profile.first_name?.charAt(0) || "?").toUpperCase();
  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ") || "Unnamed";

  return (
    <div>
      {/* Back link */}
      <Link
        href="/browse-candidates"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-light hover:text-primary transition-colors mb-6"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
        </svg>
        Back to candidates
      </Link>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-6 py-8 sm:px-8">
          <div className="flex items-center gap-5">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-20 w-20 rounded-full object-cover ring-4 ring-white shadow"
              />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white text-2xl font-bold ring-4 ring-white shadow">
                {initial}
              </span>
            )}
            <div>
              <h1 className="text-2xl font-bold font-display text-text">
                {fullName}
              </h1>
              <div className="mt-1.5 flex items-center gap-3 text-sm text-text-light flex-wrap">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    {profile.location}
                  </span>
                )}
                {profile.experience_years != null && (
                  <span>
                    {profile.experience_years}{" "}
                    {profile.experience_years === 1 ? "year" : "years"} experience
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    profile.visibility === "actively_looking"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {profile.visibility === "actively_looking"
                    ? "Actively Looking"
                    : "Open to Opportunities"}
                </span>
              </div>
              <div className="mt-3">
                <InviteToApplyButton candidateName={fullName} candidateUserId={profile.user_id} />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 sm:px-8 space-y-8">
          {/* Bio */}
          {profile.bio && (
            <section>
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">
                About
              </h2>
              <p className="text-text leading-relaxed whitespace-pre-line">
                {profile.bio}
              </p>
            </section>
          )}

          {/* Skills */}
          {profile.skills && profile.skills.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                Skills
              </h2>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill: string) => (
                  <span
                    key={skill}
                    className="inline-block rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Education */}
          {profile.education && (
            <section>
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">
                Education
              </h2>
              <p className="text-text">{profile.education}</p>
            </section>
          )}

          {/* CV Download */}
          {profile.cv_url && (
            <section>
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                Resume / CV
              </h2>
              <a
                href={`/api/cv-download?profileId=${profile.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[--radius-button] border-2 border-primary/20 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download CV
              </a>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
