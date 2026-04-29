import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import InviteToApplyButton from "@/components/InviteToApplyButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CandidateProfilePage({ params }: PageProps) {
  const user = await requireRole("employer");
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("seeker_profiles")
    .select("*")
    .eq("id", id)
    .eq("visibility", "actively_looking")
    .single();

  if (!profile) {
    redirect("/browse-candidates");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("is_pro, pro_expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const isProActive =
    company?.is_pro === true &&
    (!company.pro_expires_at || new Date(company.pro_expires_at) > new Date());

  const initial = (profile.first_name?.charAt(0) || "?").toUpperCase();
  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ") || "Unnamed";

  const hasSkills = profile.skills && profile.skills.length > 0;
  const hasBio = !!profile.bio;
  const hasEducation = !!profile.education;
  const hasCv = !!profile.cv_url;

  // Check for built resume
  const { data: cvProfile } = await supabase
    .from("cv_profiles")
    .select("id, user_id")
    .eq("user_id", profile.user_id)
    .maybeSingle();
  const hasBuiltResume = !!cvProfile;

  return (
    <div className="max-w-3xl mx-auto">
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

      {/* Profile Card */}
      <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm">

        {/* Header */}
        <div className="relative bg-gradient-to-br from-primary/8 via-primary/5 to-transparent px-6 py-10 sm:px-10">
          {/* Status badge */}
          <div className="absolute top-4 right-4">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                profile.visibility === "actively_looking"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${
                profile.visibility === "actively_looking" ? "bg-emerald-500" : "bg-blue-500"
              }`} />
              {profile.visibility === "actively_looking"
                ? "Actively Looking"
                : "Open to Opportunities"}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white shadow-lg"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-primary text-white text-3xl font-bold ring-4 ring-white shadow-lg">
                {initial}
              </span>
            )}

            <div className="text-center sm:text-left flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold font-display text-text">
                {fullName}
              </h1>

              <div className="mt-2 flex items-center justify-center sm:justify-start gap-4 text-sm text-text-light flex-wrap">
                {profile.location && (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    {profile.location}
                  </span>
                )}
                {profile.experience_years != null && (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                    </svg>
                    {profile.experience_years} {profile.experience_years === 1 ? "year" : "years"} experience
                  </span>
                )}
              </div>

              {/* CTA */}
              <div className="mt-5 flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                {isProActive ? (
                  <InviteToApplyButton candidateName={fullName} candidateUserId={profile.user_id} />
                ) : (
                  <Link
                    href="/employers/upgrade"
                    className="inline-flex items-center gap-2 rounded-full bg-accent-warm px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-warm-hover transition-colors"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Upgrade to Invite
                  </Link>
                )}
                {hasCv && isProActive && (
                  <a
                    href={`/api/cv-download?profileId=${profile.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-text-light hover:text-primary hover:border-primary/30 transition-colors"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download CV
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content sections */}
        <div className="divide-y divide-border">

          {/* About */}
          {hasBio && (
            <div className="px-6 py-6 sm:px-10">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                About
              </h2>
              <p className="text-sm text-text leading-relaxed whitespace-pre-line">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Skills */}
          {hasSkills && (
            <div className="px-6 py-6 sm:px-10">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Skills
              </h2>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill: string) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-lg bg-primary/8 border border-primary/15 px-3 py-1.5 text-sm font-medium text-primary"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Education + Experience */}
          {(hasEducation || profile.experience_years != null) && (
            <div className="px-6 py-6 sm:px-10">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5" />
                </svg>
                Background
              </h2>
              <div className="space-y-3">
                {hasEducation && (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-alt">
                      <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-text-muted">Education</p>
                      <p className="text-sm text-text">{profile.education}</p>
                    </div>
                  </div>
                )}
                {profile.experience_years != null && (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-alt">
                      <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-text-muted">Experience</p>
                      <p className="text-sm text-text">
                        {profile.experience_years} {profile.experience_years === 1 ? "year" : "years"} of professional experience
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resume — visible to all (so employers know one exists),
              but actual download is gated behind Pro */}
          {(hasCv || hasBuiltResume) && (
            <div className="px-6 py-6 sm:px-10">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                Resume
              </h2>
              <div className="relative">
                <div
                  className={`flex flex-wrap gap-3 ${isProActive ? "" : "select-none"}`}
                  style={isProActive ? undefined : { filter: "blur(5px)", pointerEvents: "none" }}
                  aria-hidden={isProActive ? undefined : true}
                >
                  {hasCv && (
                    isProActive ? (
                      <a
                        href={`/api/cv-download?profileId=${profile.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 rounded-xl border border-border bg-bg-alt/50 px-5 py-3.5 hover:border-primary/30 hover:bg-primary/5 transition-colors group"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text group-hover:text-primary transition-colors">
                            {profile.first_name ? `${profile.first_name}'s Resume` : "Resume"}
                          </p>
                          <p className="text-xs text-text-muted">Uploaded PDF — Click to download</p>
                        </div>
                      </a>
                    ) : (
                      <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-bg-alt/50 px-5 py-3.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text">
                            {profile.first_name ? `${profile.first_name}'s Resume` : "Resume"}
                          </p>
                          <p className="text-xs text-text-muted">Uploaded PDF — Click to download</p>
                        </div>
                      </div>
                    )
                  )}
                  {hasBuiltResume && (
                    isProActive ? (
                      <a
                        href={`/api/cv/export?userId=${profile.user_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 rounded-xl border border-border bg-bg-alt/50 px-5 py-3.5 hover:border-emerald-300/50 hover:bg-emerald-50/50 transition-colors group"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                          <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <polyline points="16 13 12 17 8 13" />
                            <line x1="12" y1="17" x2="12" y2="9" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text group-hover:text-emerald-700 transition-colors">
                            JobLink Built Resume
                          </p>
                          <p className="text-xs text-text-muted">Generated PDF — Click to download</p>
                        </div>
                      </a>
                    ) : (
                      <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-bg-alt/50 px-5 py-3.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                          <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <polyline points="16 13 12 17 8 13" />
                            <line x1="12" y1="17" x2="12" y2="9" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text">
                            JobLink Built Resume
                          </p>
                          <p className="text-xs text-text-muted">Generated PDF — Click to download</p>
                        </div>
                      </div>
                    )
                  )}
                </div>
                {!isProActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Link
                      href="/employers/upgrade"
                      className="inline-flex items-center gap-2 rounded-full bg-accent-warm px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-accent-warm-hover transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Upgrade to view resume
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
