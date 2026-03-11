"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ANTIGUA_PARISHES } from "@/lib/types";
import { calculateProfileCompletion } from "@/lib/profile-completion";
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
    description:
      "Your profile is hidden, but you can still browse and apply",
  },
];

function getVisibilityLabel(value: VisibilityMode): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function getVisibilityDescription(value: VisibilityMode): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === value)?.description ?? "";
}

// ─── Profile View (read-only) ───────────────────────────────────
function ProfileView({
  profile,
  onEdit,
}: {
  profile: ProfileData;
  onEdit: () => void;
}) {
  const { percentage, missing } = getCompletion(profile);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text sm:text-3xl">My Profile</h1>
          <p className="mt-1 text-text-light">
            View and manage your profile information.
          </p>
        </div>
        <button
          onClick={onEdit}
          className="rounded-lg bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2a4f7f] transition-colors"
        >
          Edit Profile
        </button>
      </div>

      {/* Profile Completion */}
      <div className="mt-4 rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text">Profile Completion</span>
          <span className="font-semibold text-[#1e3a5f]">{percentage}%</span>
        </div>
        <div className="mt-2 h-2.5 w-full rounded-full bg-gray-100">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${percentage === 100 ? "bg-green-500" : "bg-[#1e3a5f]"}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {missing.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-text-light">Missing:</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {missing.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Personal Information */}
      <div className="mt-6 rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Personal Information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-light">First Name</p>
            <p className="mt-1 text-sm text-text">{profile.first_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-light">Last Name</p>
            <p className="mt-1 text-sm text-text">{profile.last_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-light">Phone</p>
            <p className="mt-1 text-sm text-text">{profile.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-light">Location</p>
            <p className="mt-1 text-sm text-text">{profile.location || "—"}</p>
          </div>
        </div>
        {profile.bio && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-text-light">Bio</p>
            <p className="mt-1 text-sm text-text whitespace-pre-line">{profile.bio}</p>
          </div>
        )}
      </div>

      {/* Skills & Experience */}
      <div className="mt-6 rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Skills & Experience</h2>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-light">Skills</p>
            {profile.skills.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-text">—</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-light">Years of Experience</p>
              <p className="mt-1 text-sm text-text">
                {profile.experience_years !== null ? profile.experience_years : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-light">Education</p>
              <p className="mt-1 text-sm text-text">{profile.education || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* CV */}
      <div className="mt-6 rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">CV</h2>
        {profile.cv_url ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-3">
              <svg className="h-8 w-8 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800">CV uploaded</p>
                <a
                  href={profile.cv_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-green-600 hover:underline truncate block"
                >
                  View CV
                </a>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-light">No CV uploaded yet.</p>
        )}
      </div>

      {/* Visibility */}
      <div className="mt-6 rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text">Profile Visibility</h2>
        <div className="mt-4">
          <p className="text-sm font-medium text-text">{getVisibilityLabel(profile.visibility)}</p>
          <p className="mt-0.5 text-sm text-text-light">{getVisibilityDescription(profile.visibility)}</p>
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
  onSaved,
  onCancel,
}: {
  initialProfile: ProfileData;
  initialProfileId: string | null;
  userId: string;
  isNewProfile: boolean;
  onSaved: (profile: ProfileData, profileId: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<ProfileData>(initialProfile);
  const [profileId, setProfileId] = useState<string | null>(initialProfileId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [uploading, setUploading] = useState(false);

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
        // Switch back to view mode after a brief delay
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

    const { error: uploadError } = await supabase.storage
      .from("cvs")
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      setMessage({ type: "error", text: "Failed to upload CV. Please try again." });
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("cvs").getPublicUrl(fileName);

    setProfile((prev) => ({ ...prev, cv_url: publicUrl }));
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
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text sm:text-3xl">
            {isNewProfile ? "Create Profile" : "Edit Profile"}
          </h1>
          <p className="mt-1 text-text-light">
            {isNewProfile
              ? "Complete your profile to stand out to employers."
              : "Update your profile information."}
          </p>
        </div>
        {!isNewProfile && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-light hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Overall Progress */}
      <div className="mt-4 rounded-xl border border-border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text">Profile Completion</span>
          <span className="font-semibold text-[#1e3a5f]">{completePct}%</span>
        </div>
        <div className="mt-2 h-2.5 w-full rounded-full bg-gray-100">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${completePct === 100 ? "bg-green-500" : "bg-[#1e3a5f]"}`}
            style={{ width: `${completePct}%` }}
          />
        </div>
        {missing.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-text-light">Missing:</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {missing.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
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
                ? "bg-[#1e3a5f] text-white"
                : s < step
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-text-light"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-2 text-sm text-text-light">
          Step {step} of 4
        </span>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mt-4 rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Step Content */}
      <div className="mt-6 rounded-xl border border-border bg-white p-6 shadow-sm">
        {/* Step 1: Personal Info */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-text">Personal Information</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  value={profile.first_name}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, first_name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={profile.last_name}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, last_name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, phone: e.target.value }))
                }
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                placeholder="+1 (268) 555-0123"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Location (Parish)
              </label>
              <select
                value={profile.location}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, location: e.target.value }))
                }
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
              >
                <option value="">Select a parish</option>
                {ANTIGUA_PARISHES.map((parish) => (
                  <option key={parish} value={parish}>
                    {parish}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Bio
              </label>
              <textarea
                value={profile.bio}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, bio: e.target.value }))
                }
                rows={4}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] resize-none"
                placeholder="Tell employers a bit about yourself..."
              />
            </div>
          </div>
        )}

        {/* Step 2: Skills & Experience */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-text">
              Skills &amp; Experience
            </h2>

            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Skills
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                  placeholder="Type a skill and press Enter"
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2a4f7f] transition-colors"
                >
                  Add
                </button>
              </div>
              {profile.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeSkill(skill)}
                        className="ml-0.5 text-blue-400 hover:text-blue-700"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Years of Experience
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={profile.experience_years ?? ""}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    experience_years: e.target.value ? parseInt(e.target.value) : null,
                  }))
                }
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                placeholder="e.g. 5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-1">
                Education
              </label>
              <input
                type="text"
                value={profile.education}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, education: e.target.value }))
                }
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]"
                placeholder="e.g. BSc in Computer Science, UWI"
              />
            </div>
          </div>
        )}

        {/* Step 3: CV Upload */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-text">CV Upload</h2>
            <p className="text-sm text-text-light">
              Upload your CV as a PDF (max 5MB). This will be shared with employers when you apply.
            </p>

            {profile.cv_url && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800">CV uploaded</p>
                    <a
                      href={profile.cv_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-green-600 hover:underline truncate block"
                    >
                      View current CV
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block cursor-pointer">
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 hover:border-[#1e3a5f] hover:bg-gray-50 transition-colors">
                  {uploading ? (
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#1e3a5f]" />
                  ) : (
                    <>
                      <svg className="h-10 w-10 text-text-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <p className="mt-2 text-sm font-medium text-text">
                        {profile.cv_url ? "Upload a new CV" : "Click to upload your CV"}
                      </p>
                      <p className="mt-1 text-xs text-text-light">PDF up to 5MB</p>
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
          </div>
        )}

        {/* Step 4: Visibility */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-text">
              Profile Visibility
            </h2>
            <p className="text-sm text-text-light">
              Control who can see your profile.
            </p>

            <div className="space-y-3">
              {VISIBILITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                    profile.visibility === opt.value
                      ? "border-[#1e3a5f] bg-blue-50"
                      : "border-border hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={opt.value}
                    checked={profile.visibility === opt.value}
                    onChange={() =>
                      setProfile((p) => ({ ...p, visibility: opt.value }))
                    }
                    className="mt-0.5 h-4 w-4 accent-[#1e3a5f]"
                  />
                  <div>
                    <p className="font-medium text-text">{opt.label}</p>
                    <p className="text-sm text-text-light">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Navigation & Save */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-light hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2a4f7f] disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>

            {step < 4 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                className="rounded-lg bg-[#e85d26] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d14e1a] transition-colors"
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
  const [profile, setProfile] = useState<ProfileData>(INITIAL_PROFILE);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("edit"); // default to edit for new profiles

  // Load profile on mount
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const { data: existing, error } = await supabase
        .from("seeker_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

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
          visibility: existing.visibility ?? "actively_looking",
        });
        setMode("view"); // profile exists → show view mode
      } else {
        setMode("edit"); // no profile → show create form
      }

      setLoading(false);
    }

    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#1e3a5f]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loadError}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2a4f7f] transition-colors"
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
        onEdit={() => setMode("edit")}
      />
    );
  }

  return (
    <ProfileEditForm
      initialProfile={profile}
      initialProfileId={profileId}
      userId={userId!}
      isNewProfile={isNewProfile}
      onSaved={(savedProfile, savedId) => {
        setProfile(savedProfile);
        setProfileId(savedId);
        setMode("view");
      }}
      onCancel={() => setMode("view")}
    />
  );
}
