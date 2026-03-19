"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { calculateProfileCompletion } from "@/lib/profile-completion";
import { getResumePreviewUrl } from "@/lib/resume-url";
import type { VisibilityMode } from "@/lib/types";

interface ProfileData {
  first_name: string;
  last_name: string;
  phone: string;
  location: string;
  bio: string;
  skills: string[];
  experience_years: number | null;
  education: string;
  cv_url: string;
  avatar_url: string;
  visibility: VisibilityMode;
}

const INITIAL_PROFILE: ProfileData = {
  first_name: "",
  last_name: "",
  phone: "",
  location: "",
  bio: "",
  skills: [],
  experience_years: null,
  education: "",
  cv_url: "",
  avatar_url: "",
  visibility: "actively_looking",
};

function getCompletion(p: ProfileData) {
  return calculateProfileCompletion(p);
}

const VISIBILITY_OPTIONS: {
  value: VisibilityMode;
  label: string;
  description: string;
}[] = [
  {
    value: "actively_looking",
    label: "Actively Looking",
    description: "Your profile is visible to all employers",
  },
  {
    value: "open",
    label: "Open to Opportunities",
    description: "Only visible to employers when you apply",
  },
  {
    value: "not_looking",
    label: "Not Looking",
    description: "Your profile is hidden, but you can still browse and apply",
  },
];

const VISIBILITY_BANNER: Record<VisibilityMode, { bg: string; text: string; icon: string; label: string }> = {
  actively_looking: {
    bg: "bg-green-50 border-green-200",
    text: "text-green-800",
    icon: "text-green-600",
    label: "Employers can find your profile",
  },
  open: {
    bg: "bg-blue-50 border-blue-200",
    text: "text-blue-800",
    icon: "text-blue-600",
    label: "Open to opportunities",
  },
  not_looking: {
    bg: "bg-bg-alt border-border",
    text: "text-text-light",
    icon: "text-text-muted",
    label: "Your profile is hidden from employers",
  },
};

// ─── Inline SVG Icons ────────────────────────────────────────────
function IconPhone({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function IconMail({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function IconMapPin({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconFile({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconChevron({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconEye({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconBriefcase({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function IconGrad({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5" />
    </svg>
  );
}

function IconPen({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconUpload({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconCamera({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
    </svg>
  );
}

// ─── Avatar Component ───────────────────────────────────────────
function ProfileAvatar({
  avatarUrl,
  initials,
  size = "lg",
  onUpload,
  uploading,
}: {
  avatarUrl: string;
  initials: string;
  size?: "lg" | "sm";
  onUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading?: boolean;
}) {
  const sizeClasses = size === "lg"
    ? "h-16 w-16 sm:h-20 sm:w-20 text-xl sm:text-2xl"
    : "h-14 w-14 text-lg";

  return (
    <div className="relative group">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt="Profile"
          className={`${sizeClasses} rounded-full object-cover border-2 border-border`}
        />
      ) : (
        <div className={`flex items-center justify-center rounded-full bg-[#0d7377] font-bold text-white ${sizeClasses}`}>
          {initials}
        </div>
      )}
      {onUpload && (
        <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/0 group-hover:bg-black/40 transition-colors">
          {uploading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <IconCamera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}

// ─── Profile View (Indeed-inspired) ─────────────────────────────
function ProfileView({
  profile,
  profileId,
  email,
  userId,
  onEdit,
  onAvatarChange,
  onVisibilityChange,
}: {
  profile: ProfileData;
  profileId: string;
  email: string;
  userId: string;
  onEdit: (step?: number) => void;
  onAvatarChange: (url: string) => void;
  onVisibilityChange: (value: VisibilityMode) => void;
}) {
  const { percentage, missing } = getCompletion(profile);
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Your Name";
  const initials = [profile.first_name?.[0], profile.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const banner = VISIBILITY_BANNER[profile.visibility];
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleStatusChange = async (newValue: VisibilityMode) => {
    if (newValue === profile.visibility) {
      setStatusOpen(false);
      return;
    }
    setStatusSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone: profile.phone,
          location: profile.location,
          bio: profile.bio,
          skills: profile.skills,
          experience_years: profile.experience_years,
          education: profile.education,
          cv_url: profile.cv_url,
          avatar_url: profile.avatar_url,
          visibility: newValue,
          profile_complete_pct: percentage,
        }),
      });
      if (res.ok) {
        onVisibilityChange(newValue);
        setStatusOpen(false);
      } else {
        const data = await res.json();
        setStatusMsg(data.error || "Failed to update status.");
      }
    } catch {
      setStatusMsg("Network error. Please try again.");
    }
    setStatusSaving(false);
  };

  const handleResumePreview = async () => {
    if (!profile.cv_url) return;
    // Open blank tab synchronously within user gesture to avoid popup blocker
    const newTab = window.open("", "_blank");
    if (!newTab) {
      setResumeError("Popup blocked. Please allow popups for this site.");
      return;
    }
    newTab.document.write(
      '<html><head><title>Loading resume…</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#555"><p>Loading resume preview…</p></body></html>'
    );
    setResumeLoading(true);
    setResumeError(null);
    const result = await getResumePreviewUrl(profile.cv_url);
    setResumeLoading(false);
    if ("error" in result) {
      newTab.close();
      setResumeError(result.error);
    } else {
      newTab.location.href = result.url;
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (!file.type.startsWith("image/")) {
      setAvatarMsg("Please upload an image file (JPG, PNG, or WebP).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarMsg("Image must be less than 2MB.");
      return;
    }

    setAvatarUploading(true);
    setAvatarMsg(null);

    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${userId}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      setAvatarMsg("Failed to upload photo. Please try again.");
      setAvatarUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);

    // Save to profile
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile_id: profileId,
        avatar_url: publicUrl,
        // send existing data to avoid overwriting
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        location: profile.location,
        bio: profile.bio,
        skills: profile.skills,
        experience_years: profile.experience_years,
        education: profile.education,
        cv_url: profile.cv_url,
        visibility: profile.visibility,
        profile_complete_pct: percentage,
      }),
    });

    if (res.ok) {
      onAvatarChange(publicUrl);
    } else {
      setAvatarMsg("Photo uploaded but failed to save to profile.");
    }

    setAvatarUploading(false);
  };

  return (
    <div className="mx-auto max-w-2xl pb-12">

      {/* ── Profile Header Card ── */}
      <div className="rounded-lg border border-border bg-white">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            {/* Left: Name & contact */}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold font-display text-text sm:text-[28px] leading-tight">
                {fullName}
              </h1>

              <div className="mt-3 flex flex-col gap-1.5">
                {email && (
                  <div className="flex items-center gap-2 text-sm text-text-light">
                    <IconMail className="h-4 w-4 flex-shrink-0 text-text-muted" />
                    <span className="truncate">{email}</span>
                  </div>
                )}
                {profile.phone && (
                  <div className="flex items-center gap-2 text-sm text-text-light">
                    <IconPhone className="h-4 w-4 flex-shrink-0 text-text-muted" />
                    <span>{profile.phone}</span>
                  </div>
                )}
                {profile.location && (
                  <div className="flex items-center gap-2 text-sm text-text-light">
                    <IconMapPin className="h-4 w-4 flex-shrink-0 text-text-muted" />
                    <span>{profile.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Avatar + Edit */}
            <div className="flex flex-col items-center gap-3">
              <ProfileAvatar
                avatarUrl={profile.avatar_url}
                initials={initials}
                size="lg"
                onUpload={handleAvatarUpload}
                uploading={avatarUploading}
              />
              <button
                onClick={() => onEdit(1)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0d7377] hover:text-[#095355] transition-colors"
              >
                <IconPen className="h-3.5 w-3.5" />
                Edit
              </button>
            </div>
          </div>
          {avatarMsg && (
            <p className="mt-3 text-xs text-red-600">{avatarMsg}</p>
          )}
        </div>

        {/* Completion bar — only show if not 100% */}
        {percentage < 100 && (
          <div className="border-t border-border px-6 py-3 bg-bg-alt/50">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-text-light">Profile {percentage}% complete</span>
              <button onClick={() => onEdit(1)} className="font-medium text-[#14919b] hover:underline">
                Complete profile
              </button>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-border">
              <div
                className="h-1.5 rounded-full bg-[#0d7377] transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
            {missing.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {missing.map((item) => (
                  <span key={item} className="text-[11px] text-text-muted">
                    {item}{missing.indexOf(item) < missing.length - 1 ? " · " : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Status Selector ── */}
      <div className="mt-4">
        <button
          onClick={() => setStatusOpen(!statusOpen)}
          className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${banner.bg}`}
        >
          <IconEye className={`h-5 w-5 flex-shrink-0 ${banner.icon}`} />
          <div className="flex-1 text-left">
            <p className={`text-sm font-medium ${banner.text}`}>{banner.label}</p>
            <p className="text-xs text-text-light mt-0.5">
              {VISIBILITY_OPTIONS.find((o) => o.value === profile.visibility)?.description}
            </p>
          </div>
          <svg
            className={`h-4 w-4 text-text-muted transition-transform ${statusOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {statusOpen && (
          <div className="mt-2 space-y-2">
            {VISIBILITY_OPTIONS.map((opt) => {
              const isSelected = profile.visibility === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  disabled={statusSaving}
                  className={`w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    isSelected
                      ? "border-[#0d7377] bg-[#0d7377]/5"
                      : "border-border hover:border-border hover:bg-bg-alt"
                  } ${statusSaving ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? "border-[#0d7377]" : "border-border"
                  }`}>
                    {isSelected && <div className="h-2 w-2 rounded-full bg-[#0d7377]" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isSelected ? "text-[#0d7377]" : "text-text"}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-text-light mt-0.5">{opt.description}</p>
                  </div>
                  {isSelected && statusSaving && (
                    <div className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-[#0d7377]/30 border-t-[#0d7377]" />
                  )}
                </button>
              );
            })}
          </div>
        )}
        {statusMsg && (
          <p className="mt-2 text-sm text-red-600">{statusMsg}</p>
        )}
      </div>

      {/* ── Resume / CV Section ── */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold font-display text-text">Resume</h2>
          <button onClick={() => onEdit(3)} className="text-sm font-medium text-[#0d7377] hover:underline">
            {profile.cv_url ? "Update" : "Upload"}
          </button>
        </div>
        <div className="rounded-lg border border-border bg-white">
          {profile.cv_url ? (
            <button
              onClick={handleResumePreview}
              disabled={resumeLoading}
              className="flex w-full items-center gap-4 p-4 hover:bg-bg-alt transition-colors text-left"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
                {resumeLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0d7377]/30 border-t-[#0d7377]" />
                ) : (
                  <IconFile className="h-6 w-6 text-[#0d7377]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">
                  {profile.first_name ? `${profile.first_name}'s CV` : "My CV"}
                </p>
                <p className="text-xs text-text-light mt-0.5">
                  {resumeLoading ? "Opening preview…" : "PDF document"}
                </p>
              </div>
              <IconChevron className="h-4 w-4 text-text-muted flex-shrink-0" />
            </button>
          ) : (
            <button onClick={() => onEdit(3)} className="flex w-full items-center gap-4 p-4 hover:bg-bg-alt transition-colors text-left">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-border">
                <IconUpload className="h-5 w-5 text-text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">Upload your CV</p>
                <p className="text-xs text-text-light mt-0.5">Add a resume to apply faster</p>
              </div>
              <IconChevron className="h-4 w-4 text-text-muted flex-shrink-0" />
            </button>
          )}
        </div>
        {resumeError && (
          <p className="mt-2 text-sm text-red-600">{resumeError}</p>
        )}
      </div>

      {/* ── Qualifications Section ── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold font-display text-text">Qualifications</h2>
          <button onClick={() => onEdit(2)} className="text-sm font-medium text-[#0d7377] hover:underline">
            Edit
          </button>
        </div>
        <div className="rounded-lg border border-border bg-white divide-y divide-border">
          {/* Skills */}
          <div className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Skills</p>
            {profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-md bg-bg-alt px-2.5 py-1 text-xs font-medium text-text-light"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">No skills added yet</p>
            )}
          </div>

          {/* Experience */}
          <div className="flex items-center gap-3 p-4">
            <IconBriefcase className="h-5 w-5 text-text-muted flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Experience</p>
              <p className="text-sm text-text mt-0.5">
                {profile.experience_years !== null
                  ? `${profile.experience_years} ${profile.experience_years === 1 ? "year" : "years"}`
                  : "Not specified"}
              </p>
            </div>
          </div>

          {/* Education */}
          <div className="flex items-center gap-3 p-4">
            <IconGrad className="h-5 w-5 text-text-muted flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Education</p>
              <p className="text-sm text-text mt-0.5">{profile.education || "Not specified"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── About / Bio Section ── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold font-display text-text">About</h2>
          <button onClick={() => onEdit(1)} className="text-sm font-medium text-[#0d7377] hover:underline">
            Edit
          </button>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          {profile.bio ? (
            <p className="text-sm text-text-light leading-relaxed whitespace-pre-line">{profile.bio}</p>
          ) : (
            <p className="text-sm text-text-muted">Tell employers about yourself, your experience, and what you're looking for.</p>
          )}
        </div>
      </div>

      {/* ── Contact & Settings Section ── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold font-display text-text">Contact Information</h2>
          <button onClick={() => onEdit(1)} className="text-sm font-medium text-[#0d7377] hover:underline">
            Edit
          </button>
        </div>
        <div className="rounded-lg border border-border bg-white divide-y divide-border">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <IconMail className="h-4 w-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-muted">Email</p>
                <p className="text-sm text-text">{email || "Not set"}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <IconPhone className="h-4 w-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-muted">Phone</p>
                <p className="text-sm text-text">{profile.phone || "Not set"}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <IconMapPin className="h-4 w-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-muted">Location</p>
                <p className="text-sm text-text">{profile.location || "Not set"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Edit Form (step wizard) ────────────────────────────
function ProfileEditForm({
  initialProfile,
  initialProfileId,
  userId,
  isNewProfile,
  initialStep = 1,
  onSaved,
  onCancel,
}: {
  initialProfile: ProfileData;
  initialProfileId: string | null;
  userId: string;
  isNewProfile: boolean;
  initialStep?: number;
  onSaved: (profile: ProfileData, profileId: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(initialStep);
  const [profile, setProfile] = useState<ProfileData>(initialProfile);
  const [profileId, setProfileId] = useState<string | null>(initialProfileId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [resumePreviewLoading, setResumePreviewLoading] = useState(false);
  const [resumePreviewError, setResumePreviewError] = useState<string | null>(null);

  const handleResumePreviewInForm = async () => {
    if (!profile.cv_url) return;
    const newTab = window.open("", "_blank");
    if (!newTab) {
      setResumePreviewError("Popup blocked. Please allow popups for this site.");
      return;
    }
    newTab.document.write(
      '<html><head><title>Loading resume…</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#555"><p>Loading resume preview…</p></body></html>'
    );
    setResumePreviewLoading(true);
    setResumePreviewError(null);
    const result = await getResumePreviewUrl(profile.cv_url);
    setResumePreviewLoading(false);
    if ("error" in result) {
      newTab.close();
      setResumePreviewError(result.error);
    } else {
      newTab.location.href = result.url;
    }
  };

  const { percentage: completePct, missing } = getCompletion(profile);

  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    setMessage(null);

    const { percentage: pct } = getCompletion(profile);

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: profileId,
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone: profile.phone,
          location: profile.location,
          bio: profile.bio,
          skills: profile.skills,
          experience_years: profile.experience_years,
          education: profile.education,
          cv_url: profile.cv_url,
          avatar_url: profile.avatar_url,
          visibility: profile.visibility,
          profile_complete_pct: pct,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save profile." });
      } else {
        const savedId = data.profile_id || profileId;
        if (data.profile_id && !profileId) {
          setProfileId(data.profile_id);
        }
        setMessage({ type: "success", text: "Profile saved successfully!" });
        setTimeout(() => {
          onSaved(profile, savedId);
        }, 800);
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please check your connection." });
    }

    setSaving(false);
  }, [userId, profile, profileId, onSaved]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (file.type !== "application/pdf") {
      setMessage({ type: "error", text: "Please upload a PDF file." });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "File size must be less than 5MB." });
      return;
    }

    setUploading(true);
    setMessage(null);

    const supabase = createClient();
    const fileName = `${userId}/cv-${Date.now()}.pdf`;

    // Delete the old CV file if one exists to free up storage
    if (profile.cv_url) {
      await fetch("/api/cv-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: profile.cv_url }),
      });
    }

    const { error: uploadError } = await supabase.storage
      .from("cvs")
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      setMessage({ type: "error", text: "Failed to upload CV. Please try again." });
      setUploading(false);
      return;
    }

    // Store the storage path, not a public URL — the preview generates a signed URL at runtime
    setProfile((prev) => ({ ...prev, cv_url: fileName }));
    setMessage({ type: "success", text: "CV uploaded successfully!" });
    setUploading(false);
  };

  const addSkill = () => {
    const skill = skillInput.trim();
    if (skill && !profile.skills.includes(skill)) {
      setProfile((prev) => ({ ...prev, skills: [...prev.skills, skill] }));
    }
    setSkillInput("");
  };

  const removeSkill = (skill: string) => {
    setProfile((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skill),
    }));
  };

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-text">
            {isNewProfile ? "Create Profile" : "Edit Profile"}
          </h1>
          <p className="mt-1 text-sm text-text-light">
            {isNewProfile
              ? "Complete your profile to stand out to employers."
              : "Update your profile information."}
          </p>
        </div>
        {!isNewProfile && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-light hover:bg-bg-alt transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="mt-5 rounded-lg border border-border bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text-light">Profile Completion</span>
          <span className={`font-semibold ${completePct === 100 ? "text-green-600" : "text-[#0d7377]"}`}>{completePct}%</span>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-bg-alt">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${completePct === 100 ? "bg-green-500" : "bg-[#0d7377]"}`}
            style={{ width: `${completePct}%` }}
          />
        </div>
        {missing.length > 0 && (
          <p className="mt-2 text-xs text-text-muted">
            Missing: {missing.join(" · ")}
          </p>
        )}
      </div>

      {/* Step Indicator */}
      <div className="mt-6 flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
              s === step
                ? "bg-[#0d7377] text-white"
                : s < step
                  ? "bg-green-100 text-green-700"
                  : "bg-bg-alt text-text-muted"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-2 text-sm text-text-muted">
          Step {step} of 4
        </span>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mt-4 rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Step Content */}
      <div className="mt-5 rounded-lg border border-border bg-white p-6">
        {/* Step 1: Personal Info */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold font-display text-text">Personal Information</h2>

            {/* Profile Photo */}
            <div className="flex items-center gap-4">
              <ProfileAvatar
                avatarUrl={profile.avatar_url}
                initials={[profile.first_name?.[0], profile.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
                size="sm"
                onUpload={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !userId) return;
                  if (!file.type.startsWith("image/")) {
                    setMessage({ type: "error", text: "Please upload an image file." });
                    return;
                  }
                  if (file.size > 2 * 1024 * 1024) {
                    setMessage({ type: "error", text: "Image must be less than 2MB." });
                    return;
                  }
                  setUploading(true);
                  setMessage(null);
                  const supabase = createClient();
                  const ext = file.name.split(".").pop() || "jpg";
                  const fileName = `${userId}/avatar-${Date.now()}.${ext}`;
                  const { error: err } = await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });
                  if (err) {
                    setMessage({ type: "error", text: "Failed to upload photo." });
                    setUploading(false);
                    return;
                  }
                  const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
                  setProfile((p) => ({ ...p, avatar_url: publicUrl }));
                  setMessage({ type: "success", text: "Photo uploaded! Remember to save." });
                  setUploading(false);
                }}
                uploading={uploading}
              />
              <div>
                <p className="text-sm font-medium text-text-light">Profile photo</p>
                <p className="text-xs text-text-muted mt-0.5">JPG, PNG or WebP. Max 2MB.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-text-light mb-1">First Name *</label>
                <input
                  type="text"
                  value={profile.first_name}
                  onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-light mb-1">Last Name *</label>
                <input
                  type="text"
                  value={profile.last_name}
                  onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-text-light mb-1">Phone</label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
                  placeholder="+1 (268) 555-0123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-light mb-1">Location</label>
                <input
                  type="text"
                  value={profile.location}
                  onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
                  placeholder="St. John's, Antigua"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light mb-1">Bio</label>
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
                rows={4}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377] resize-none"
                placeholder="Tell employers a bit about yourself..."
              />
            </div>
          </div>
        )}

        {/* Step 2: Skills & Experience */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold font-display text-text">Skills & Experience</h2>

            <div>
              <label className="block text-sm font-medium text-text-light mb-1">Skills</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                  className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
                  placeholder="Type a skill and press Enter"
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="rounded-[10px] bg-[#0d7377] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#095355] transition-all duration-200"
                >
                  Add
                </button>
              </div>
              {profile.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.skills.map((skill) => (
                    <span key={skill} className="inline-flex items-center gap-1 rounded-md bg-bg-alt px-2.5 py-1 text-xs font-medium text-text-light">
                      {skill}
                      <button type="button" onClick={() => removeSkill(skill)} className="ml-0.5 text-text-muted hover:text-text-light">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light mb-1">Years of Experience</label>
              <input
                type="number"
                min="0"
                max="50"
                value={profile.experience_years ?? ""}
                onChange={(e) => setProfile((p) => ({ ...p, experience_years: e.target.value ? parseInt(e.target.value) : null }))}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
                placeholder="e.g. 5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-light mb-1">Education</label>
              <input
                type="text"
                value={profile.education}
                onChange={(e) => setProfile((p) => ({ ...p, education: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#0d7377] focus:outline-none focus:ring-1 focus:ring-[#0d7377]"
                placeholder="e.g. BSc in Computer Science, UWI"
              />
            </div>
          </div>
        )}

        {/* Step 3: CV Upload */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold font-display text-text">Resume / CV</h2>
            <p className="text-sm text-text-light">Upload your CV as a PDF (max 5MB).</p>

            {profile.cv_url && (
              <div className="flex items-center gap-3 rounded-lg border border-border p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                  {resumePreviewLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0d7377]/30 border-t-[#0d7377]" />
                  ) : (
                    <IconFile className="h-5 w-5 text-[#0d7377]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">CV uploaded</p>
                  <button
                    onClick={handleResumePreviewInForm}
                    disabled={resumePreviewLoading}
                    className="text-xs text-[#0d7377] hover:underline truncate block"
                  >
                    {resumePreviewLoading ? "Opening…" : "View current CV"}
                  </button>
                  {resumePreviewError && (
                    <p className="text-xs text-red-600 mt-1">{resumePreviewError}</p>
                  )}
                </div>
              </div>
            )}

            <label className="block cursor-pointer">
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 hover:border-[#0d7377] hover:bg-bg-alt/50 transition-colors">
                {uploading ? (
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-[#0d7377]" />
                ) : (
                  <>
                    <IconUpload className="h-8 w-8 text-text-muted" />
                    <p className="mt-2 text-sm font-medium text-text-light">
                      {profile.cv_url ? "Upload a new CV" : "Click to upload your CV"}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">PDF up to 5MB</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        )}

        {/* Step 4: Visibility */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold font-display text-text">Profile Visibility</h2>
            <p className="text-sm text-text-light">Control who can see your profile.</p>

            <div className="space-y-2.5">
              {VISIBILITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                    profile.visibility === opt.value
                      ? "border-[#0d7377] bg-blue-50/50"
                      : "border-border hover:border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={opt.value}
                    checked={profile.visibility === opt.value}
                    onChange={() => setProfile((p) => ({ ...p, visibility: opt.value }))}
                    className="mt-0.5 h-4 w-4 accent-[#0d7377]"
                  />
                  <div>
                    <p className="text-sm font-medium text-text">{opt.label}</p>
                    <p className="text-xs text-text-light mt-0.5">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Navigation & Save */}
        <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-light hover:bg-bg-alt disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-[10px] bg-[#0d7377] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#095355] disabled:opacity-60 transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-[#0d7377]/20"
            >
              {saving ? "Saving..." : "Save"}
            </button>

            {step < 4 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                className="rounded-[10px] bg-[#14919b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0d7377] transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-[#0d7377]/20"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading, setAvatarUrl: setGlobalAvatarUrl } = useAuth();
  const [profile, setProfile] = useState<ProfileData>(INITIAL_PROFILE);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("edit");
  const [editStep, setEditStep] = useState(1);

  useEffect(() => {
    // Wait for AuthProvider to finish loading
    if (authLoading) return;

    // AuthProvider already validated the session — use its user directly
    if (!authUser) {
      setLoadError("Session expired. Please sign in again.");
      setLoading(false);
      return;
    }

    // Reset error state in case we're re-running after auth resolved
    setLoadError(null);
    setLoading(true);
    setUserId(authUser.id);
    setEmail(authUser.email ?? "");

    let cancelled = false;

    async function loadProfile() {
      const supabase = createClient();

      const { data: existing, error } = await supabase
        .from("seeker_profiles")
        .select("*")
        .eq("user_id", authUser!.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Failed to load profile:", error);
        setLoadError("Failed to load profile. Please try refreshing the page.");
        setLoading(false);
        return;
      }

      if (existing) {
        setProfileId(existing.id);
        setProfile({
          first_name: existing.first_name ?? "",
          last_name: existing.last_name ?? "",
          phone: existing.phone ?? "",
          location: existing.location ?? "",
          bio: existing.bio ?? "",
          skills: existing.skills ?? [],
          experience_years: existing.experience_years,
          education: existing.education ?? "",
          cv_url: existing.cv_url ?? "",
          avatar_url: existing.avatar_url ?? "",
          visibility: existing.visibility ?? "actively_looking",
        });
        setMode("view");
      } else {
        setMode("edit");
      }

      setLoading(false);
    }

    loadProfile();

    return () => { cancelled = true; };
  }, [authLoading, authUser]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-[#0d7377]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-[10px] bg-[#0d7377] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#095355] transition-all duration-200 hover:-translate-y-px hover:shadow-md hover:shadow-[#0d7377]/20"
        >
          Retry
        </button>
      </div>
    );
  }

  const isNewProfile = !profileId;

  if (mode === "view" && !isNewProfile) {
    return (
      <ProfileView
        profile={profile}
        profileId={profileId!}
        email={email}
        userId={userId!}
        onEdit={(step) => { setEditStep(step ?? 1); setMode("edit"); }}
        onAvatarChange={(url) => {
          setProfile((p) => ({ ...p, avatar_url: url }));
          setGlobalAvatarUrl(url);
        }}
        onVisibilityChange={(v) => setProfile((p) => ({ ...p, visibility: v }))}
      />
    );
  }

  return (
    <ProfileEditForm
      key={editStep}
      initialProfile={profile}
      initialProfileId={profileId}
      userId={userId!}
      isNewProfile={isNewProfile}
      initialStep={editStep}
      onSaved={(savedProfile, savedId) => {
        setProfile(savedProfile);
        setProfileId(savedId);
        setGlobalAvatarUrl(savedProfile.avatar_url || null);
        setMode("view");
      }}
      onCancel={() => setMode("view")}
    />
  );
}
