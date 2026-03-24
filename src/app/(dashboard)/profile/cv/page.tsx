"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import CvCompletionBar from "@/components/cv/CvCompletionBar";
import ExperienceEditor from "@/components/cv/ExperienceEditor";
import EducationEditor from "@/components/cv/EducationEditor";
import SkillsEditor from "@/components/cv/SkillsEditor";
import type { CvFull, CvWorkExperience, CvEducation, CvAward, CvCertification } from "@/lib/types";
import { calculateCvCompletion } from "@/lib/cv-completion";

type EditingSection = null | "experience" | "education" | "award" | "certification";

function formatDate(d: string | null | undefined): string {
  if (!d) return "Present";
  return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const THEMES = [
  { id: "classic", name: "Classic", color: "#1a1a1a" },
  { id: "modern", name: "Modern", color: "#0d7377" },
  { id: "bold", name: "Bold", color: "#dc2626" },
  { id: "minimal", name: "Minimal", color: "#525252" },
  { id: "professional", name: "Professional", color: "#1e3a5f" },
  { id: "executive", name: "Executive", color: "#7c3aed" },
  { id: "creative", name: "Creative", color: "#ea580c" },
  { id: "ocean", name: "Ocean", color: "#0369a1" },
  { id: "sunset", name: "Sunset", color: "#be185d" },
  { id: "forest", name: "Forest", color: "#15803d" },
];

export default function CvBuilderPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [cv, setCv] = useState<CvFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<EditingSection>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartPreview, setSmartPreview] = useState<Record<string, unknown> | null>(null);
  const [smartPurchased, setSmartPurchased] = useState(false);
  const [smartError, setSmartError] = useState("");
  const [showIntake, setShowIntake] = useState(false);
  const [intakeForm, setIntakeForm] = useState({
    targetRole: "",
    yearsExperience: "",
    pastRoles: "",
    topSkills: "",
    education: "",
  });
  const [selectedTheme, setSelectedTheme] = useState("modern");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCv = useCallback(async () => {
    const res = await fetch("/api/cv");
    const data = await res.json();
    if (data.exists) {
      setCv({
        profile: data.profile,
        contact: data.contact,
        experiences: data.experiences,
        education: data.education,
        skills: data.skills,
        awards: data.awards,
        certifications: data.certifications,
      });
    } else {
      setCv(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      fetchCv();
      fetch("/api/ai/resume/status")
        .then((r) => r.json())
        .then((d) => {
          if (d.purchased) setSmartPurchased(true);
          if (d.preview) setSmartPreview(d.preview);
        })
        .catch(() => {});

      const params = new URLSearchParams(window.location.search);
      if (params.get("unlock") === "true") {
        setSmartPurchased(true);
        fetch("/api/ai/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "unlock" }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.success) {
              setSmartPreview(null);
              fetchCv();
              window.history.replaceState({}, "", "/profile/cv");
            }
          })
          .catch(() => {});
      }
    }
  }, [user, authLoading, fetchCv]);

  async function handleSmartResume() {
    if (!intakeForm.targetRole.trim()) {
      setSmartError("Please enter your target role.");
      return;
    }
    setSmartLoading(true);
    setSmartError("");
    try {
      const res = await fetch("/api/ai/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "preview",
          intake: {
            targetRole: intakeForm.targetRole,
            yearsExperience: Number(intakeForm.yearsExperience) || 1,
            pastRoles: intakeForm.pastRoles,
            topSkills: intakeForm.topSkills,
            education: intakeForm.education,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSmartError(data.error || "Something went wrong.");
        return;
      }
      setSmartPreview(data.preview);
      setShowIntake(false);
    } catch {
      setSmartError("Something went wrong. Please try again.");
    } finally {
      setSmartLoading(false);
    }
  }

  function handleFieldChange(field: "job_title" | "summary", value: string) {
    if (!cv) return;
    setCv((prev) => prev ? { ...prev, profile: { ...prev.profile, [field]: value } } : prev);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      setSaving(false);
    }, 800);
  }

  async function createCv() {
    setLoading(true);
    await fetch("/api/cv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    await fetchCv();
  }

  async function saveExperience(data: Partial<CvWorkExperience>) {
    const isEdit = !!data.id;
    await fetch("/api/cv/experience", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingSection(null);
    setEditingId(null);
    await fetchCv();
  }

  async function deleteExperience(id: string) {
    if (!confirm("Remove this experience?")) return;
    await fetch(`/api/cv/experience?id=${id}`, { method: "DELETE" });
    await fetchCv();
  }

  async function saveEducation(data: Partial<CvEducation>) {
    const isEdit = !!data.id;
    await fetch("/api/cv/education", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingSection(null);
    setEditingId(null);
    await fetchCv();
  }

  async function deleteEducation(id: string) {
    if (!confirm("Remove this education entry?")) return;
    await fetch(`/api/cv/education?id=${id}`, { method: "DELETE" });
    await fetchCv();
  }

  async function saveSkills(skills: { name: string }[]) {
    await fetch("/api/cv/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills }),
    });
    await fetchCv();
  }

  async function saveAward(data: Partial<CvAward>) {
    const isEdit = !!data.id;
    await fetch("/api/cv/awards", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingSection(null);
    setEditingId(null);
    await fetchCv();
  }

  async function deleteAward(id: string) {
    if (!confirm("Remove this award?")) return;
    await fetch(`/api/cv/awards?id=${id}`, { method: "DELETE" });
    await fetchCv();
  }

  async function saveCertification(data: Partial<CvCertification>) {
    const isEdit = !!data.id;
    await fetch("/api/cv/certifications", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingSection(null);
    setEditingId(null);
    await fetchCv();
  }

  async function deleteCertification(id: string) {
    if (!confirm("Remove this certification?")) return;
    await fetch(`/api/cv/certifications?id=${id}`, { method: "DELETE" });
    await fetchCv();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/cv/export?theme=${selectedTheme}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Resume.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteCv() {
    if (!confirm("Delete your entire Resume? This cannot be undone.")) return;
    await fetch("/api/cv", { method: "DELETE" });
    setCv(null);
  }

  // ─── Loading state ───
  if (authLoading || loading) {
    return (
      <div className="pb-24">
        <div className="mb-8">
          <div className="h-8 w-48 skeleton rounded-lg" />
          <div className="h-4 w-64 skeleton rounded mt-2" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-white p-6 animate-pulse" style={{ boxShadow: "var(--shadow-xs)" }}>
              <div className="h-4 w-1/3 skeleton rounded mb-3" />
              <div className="h-3 w-2/3 skeleton rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── No CV — onboarding state ───
  if (!cv) {
    return (
      <div className="pb-24">
        {/* Hero */}
        <div className="text-center max-w-lg mx-auto pt-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dark shadow-lg shadow-primary/20">
            <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="mt-5 font-display text-2xl sm:text-3xl text-text font-bold">Build Your Resume</h1>
          <p className="mt-2 text-sm text-text-light leading-relaxed max-w-sm mx-auto">
            Stand out to employers with a professional resume. Upload yours, build one step by step, or let Smart Resume create one for you.
          </p>
        </div>

        {/* Smart Resume CTA */}
        {!smartPurchased && !smartPreview && !showIntake && (
          <div className="mt-8 max-w-lg mx-auto">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#095355] via-[#0d7377] to-[#14919b] p-6 sm:p-8 text-white">
              <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-5 w-5 text-accent-warm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-[0.15em] text-white/80">Smart Resume</span>
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold leading-tight">
                  Your professional resume,<br />ready in seconds
                </h2>
                <p className="mt-2 text-sm text-white/70 leading-relaxed">
                  Built with the same proven format that gets candidates more interviews. Preview it free, unlock for EC$10.
                </p>
                <button
                  onClick={() => setShowIntake(true)}
                  className="mt-5 w-full sm:w-auto rounded-xl bg-white px-6 py-3 text-sm font-semibold text-primary hover:bg-white/90 transition-all shadow-lg shadow-black/10"
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Smart Resume Intake Form */}
        {showIntake && !smartPreview && (
          <div className="mt-8 max-w-lg mx-auto">
            <SmartResumeIntake
              form={intakeForm}
              onChange={setIntakeForm}
              onGenerate={handleSmartResume}
              loading={smartLoading}
              error={smartError}
              onBack={() => setShowIntake(false)}
            />
          </div>
        )}

        {/* Smart Resume Preview + Paywall */}
        {smartPreview && !smartPurchased && (
          <div className="mt-6 max-w-lg mx-auto">
            <SmartResumePreview preview={smartPreview} />
          </div>
        )}

        {/* Alternative options */}
        <div className="mt-8 max-w-lg mx-auto">
          <div className="relative flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-muted font-medium">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <a
              href="/profile"
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-5 text-center hover:border-primary/30 hover:shadow-sm transition-all"
            >
              <svg className="h-6 w-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-sm font-medium text-text">Upload PDF</span>
              <span className="text-[11px] text-text-muted">Already have one</span>
            </a>
            <button
              onClick={createCv}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-5 text-center hover:border-primary/30 hover:shadow-sm transition-all"
            >
              <svg className="h-6 w-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="text-sm font-medium text-text">Build Manually</span>
              <span className="text-[11px] text-text-muted">Step by step</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main builder ───
  const completion = calculateCvCompletion(cv);

  return (
    <div className="pb-24">
      {/* Smart Resume banner for existing CV users */}
      {!smartPurchased && !smartPreview && !showIntake && (
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-[#095355] to-[#14919b] p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <svg className="h-4 w-4 text-accent-warm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Smart Resume</p>
              <p className="text-[11px] text-white/60">Generate a complete resume in seconds</p>
            </div>
          </div>
          <button
            onClick={() => setShowIntake(true)}
            className="shrink-0 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-primary hover:bg-white/90 transition-colors"
          >
            Try free
          </button>
        </div>
      )}

      {/* Smart Resume Intake Form (inline for existing CV) */}
      {showIntake && !smartPreview && (
        <div className="mb-6">
          <SmartResumeIntake
            form={intakeForm}
            onChange={setIntakeForm}
            onGenerate={handleSmartResume}
            loading={smartLoading}
            error={smartError}
            onBack={() => setShowIntake(false)}
          />
        </div>
      )}

      {smartPreview && !smartPurchased && (
        <div className="mb-6">
          <SmartResumePreview preview={smartPreview} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-text font-bold">Resume Builder</h1>
          <p className="mt-1 text-sm text-text-light">
            {saving ? (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Saving changes...
              </span>
            ) : "Build and export your professional resume."}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-sm shadow-primary/20"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? "Exporting..." : "Download PDF"}
          </button>
          <button
            onClick={handleDeleteCv}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text-muted hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all"
            title="Delete resume"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Completion */}
      <CvCompletionBar percentage={completion.percentage} missing={completion.missing} />

      {/* Theme selector */}
      <div className="mt-5 mb-6">
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.12em] mb-3">PDF Theme</p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTheme(t.id)}
              className={`group flex flex-col items-center gap-1.5 shrink-0 rounded-xl px-3 py-2.5 transition-all ${
                selectedTheme === t.id
                  ? "bg-white shadow-sm ring-2 ring-primary/20"
                  : "hover:bg-white/60"
              }`}
            >
              <span
                className={`h-6 w-6 rounded-full transition-transform ${selectedTheme === t.id ? "scale-110 ring-2 ring-offset-2" : "group-hover:scale-105"}`}
                style={{ backgroundColor: t.color }}
              />
              <span className={`text-[10px] font-medium ${selectedTheme === t.id ? "text-text" : "text-text-muted"}`}>
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* CV Sections */}
      <div className="space-y-4">
        {/* Contact */}
        <Section title="Contact" icon={<PersonIcon />} hint="Edit from your profile page">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <InfoRow label="Name" value={[cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(" ") || "—"} />
            <InfoRow label="Email" value={cv.contact.email || "—"} />
            <InfoRow label="Phone" value={cv.contact.phone || "—"} />
            <InfoRow label="Location" value={cv.contact.location || "—"} />
          </div>
          <a href="/profile" className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-primary hover:text-primary-dark transition-colors">
            Edit contact info
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </a>
        </Section>

        {/* Job Title */}
        <Section title="Job Title" icon={<BriefcaseIcon />}>
          <input
            value={cv.profile.job_title ?? ""}
            onChange={(e) => handleFieldChange("job_title", e.target.value)}
            className="w-full rounded-xl border border-border bg-[--color-bg] px-4 py-3 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-text-muted/50"
            placeholder="e.g. Sales Manager, Nurse, Software Developer..."
          />
        </Section>

        {/* Summary */}
        <Section title="Professional Summary" icon={<FileIcon />}>
          <textarea
            value={cv.profile.summary ?? ""}
            onChange={(e) => handleFieldChange("summary", e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-border bg-[--color-bg] px-4 py-3 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none resize-none transition-all leading-relaxed placeholder:text-text-muted/50"
            placeholder="A brief summary of your professional background and career goals..."
          />
        </Section>

        {/* Work Experience */}
        <Section
          title="Work Experience"
          icon={<BriefcaseIcon />}
          onAdd={() => { setEditingSection("experience"); setEditingId(null); }}
        >
          {editingSection === "experience" && !editingId && (
            <ExperienceEditor onSave={saveExperience} onCancel={() => setEditingSection(null)} />
          )}
          {cv.experiences.map((exp) =>
            editingSection === "experience" && editingId === exp.id ? (
              <ExperienceEditor key={exp.id} initial={exp} onSave={saveExperience} onCancel={() => { setEditingSection(null); setEditingId(null); }} />
            ) : (
              <EntryCard
                key={exp.id}
                title={exp.job_title}
                subtitle={`${exp.company_name}${exp.location ? ` · ${exp.location}` : ""}`}
                date={`${formatDate(exp.start_date)} — ${exp.is_current ? "Present" : formatDate(exp.end_date)}`}
                description={exp.description}
                onEdit={() => { setEditingSection("experience"); setEditingId(exp.id); }}
                onDelete={() => deleteExperience(exp.id)}
              />
            )
          )}
          {cv.experiences.length === 0 && editingSection !== "experience" && (
            <EmptyState text="Add your work experience to stand out" />
          )}
        </Section>

        {/* Education */}
        <Section
          title="Education"
          icon={<EducationIcon />}
          onAdd={() => { setEditingSection("education"); setEditingId(null); }}
        >
          {editingSection === "education" && !editingId && (
            <EducationEditor onSave={saveEducation} onCancel={() => setEditingSection(null)} />
          )}
          {cv.education.map((edu) =>
            editingSection === "education" && editingId === edu.id ? (
              <EducationEditor key={edu.id} initial={edu} onSave={saveEducation} onCancel={() => { setEditingSection(null); setEditingId(null); }} />
            ) : (
              <EntryCard
                key={edu.id}
                title={`${edu.degree}${edu.field_of_study ? ` in ${edu.field_of_study}` : ""}`}
                subtitle={edu.institution}
                date={edu.start_date ? `${formatDate(edu.start_date)} — ${edu.is_current ? "Present" : formatDate(edu.end_date)}` : undefined}
                onEdit={() => { setEditingSection("education"); setEditingId(edu.id); }}
                onDelete={() => deleteEducation(edu.id)}
              />
            )
          )}
          {cv.education.length === 0 && editingSection !== "education" && (
            <EmptyState text="Add your education background" />
          )}
        </Section>

        {/* Skills */}
        <Section title="Skills" icon={<StarIcon />}>
          <SkillsEditor skills={cv.skills} onSave={saveSkills} />
        </Section>

        {/* Awards */}
        <Section
          title="Awards"
          icon={<TrophyIcon />}
          onAdd={() => { setEditingSection("award"); setEditingId(null); }}
        >
          {editingSection === "award" && !editingId && (
            <SimpleEntryEditor
              fields={["title", "issuer", "date_received", "description"]}
              labels={{ title: "Award Title *", issuer: "Awarded By", date_received: "Date", description: "Description" }}
              onSave={(d) => saveAward(d as Partial<CvAward>)}
              onCancel={() => setEditingSection(null)}
              saveLabel="Add Award"
            />
          )}
          {cv.awards.map((award) => (
            <EntryCard
              key={award.id}
              title={award.title}
              subtitle={award.issuer}
              date={award.date_received ? formatDate(award.date_received) : undefined}
              description={award.description}
              onEdit={() => { setEditingSection("award"); setEditingId(award.id); }}
              onDelete={() => deleteAward(award.id)}
            />
          ))}
          {cv.awards.length === 0 && editingSection !== "award" && (
            <EmptyState text="Add any awards or recognitions" />
          )}
        </Section>

        {/* Certifications */}
        <Section
          title="Certifications"
          icon={<CertIcon />}
          onAdd={() => { setEditingSection("certification"); setEditingId(null); }}
        >
          {editingSection === "certification" && !editingId && (
            <SimpleEntryEditor
              fields={["name", "issuing_organization", "issue_date", "expiry_date"]}
              labels={{ name: "Certification Name *", issuing_organization: "Issuing Organization", issue_date: "Issue Date", expiry_date: "Expiry Date" }}
              onSave={(d) => saveCertification(d as Partial<CvCertification>)}
              onCancel={() => setEditingSection(null)}
              saveLabel="Add Certification"
              dateFields={["issue_date", "expiry_date"]}
            />
          )}
          {cv.certifications.map((cert) => (
            <EntryCard
              key={cert.id}
              title={cert.name}
              subtitle={cert.issuing_organization}
              date={cert.issue_date ? formatDate(cert.issue_date) : undefined}
              onEdit={() => { setEditingSection("certification"); setEditingId(cert.id); }}
              onDelete={() => deleteCertification(cert.id)}
            />
          ))}
          {cv.certifications.length === 0 && editingSection !== "certification" && (
            <EmptyState text="Add professional certifications" />
          )}
        </Section>
      </div>
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────

function PersonIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function EducationIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 2 6 3 6 3s6-1 6-3v-5" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function CertIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Section({ title, icon, hint, onAdd, children }: {
  title: string;
  icon?: React.ReactNode;
  hint?: string;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white" style={{ boxShadow: "var(--shadow-xs)" }}>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-primary">{icon}</span>}
          <div>
            <h2 className="text-sm font-semibold text-text">{title}</h2>
            {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
          </div>
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>
      <div className="px-5 pb-5 space-y-3">{children}</div>
    </div>
  );
}

function EntryCard({ title, subtitle, date, description, onEdit, onDelete }: {
  title: string;
  subtitle?: string | null;
  date?: string;
  description?: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative rounded-xl border border-border/50 bg-[--color-bg] p-4 hover:border-border transition-all">
      <div className="pr-16">
        <p className="text-sm font-semibold text-text">{title}</p>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        {date && <p className="text-[11px] text-text-light mt-1">{date}</p>}
        {description && <p className="text-xs text-text-light mt-2 line-clamp-2 leading-relaxed">{description}</p>}
      </div>
      <div className="absolute top-3.5 right-3.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:text-primary hover:bg-primary/5 transition-colors">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button onClick={onDelete} className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] text-text-muted uppercase tracking-wider">{label}</span>
      <p className="text-sm text-text mt-0.5">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-3 text-text-muted">
      <div className="h-1 w-1 rounded-full bg-border" />
      <p className="text-xs">{text}</p>
    </div>
  );
}

function SimpleEntryEditor({ fields, labels, onSave, onCancel, saveLabel, dateFields = [] }: {
  fields: string[];
  labels: Record<string, string>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  saveLabel: string;
  dateFields?: string[];
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const data: Record<string, unknown> = {};
      for (const f of fields) {
        if (dateFields.includes(f)) {
          data[f] = form[f] ? `${form[f]}-01` : null;
        } else {
          data[f] = form[f] || null;
        }
      }
      await onSave(data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-primary/15 bg-primary/[0.02] p-4">
      {fields.map((f) => (
        <div key={f}>
          <label className="block text-xs font-medium text-text-light mb-1.5">{labels[f] || f}</label>
          {f === "description" ? (
            <textarea
              value={form[f] ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
              rows={2}
              className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none resize-none transition-all"
            />
          ) : (
            <input
              required={labels[f]?.includes("*")}
              type={dateFields.includes(f) ? "month" : "text"}
              value={form[f] ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
              className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2">
        <button type="submit" disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? "Saving..." : saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl px-5 py-2.5 text-sm font-medium text-text-light hover:text-text hover:bg-bg-alt transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

function SmartResumeIntake({ form, onChange, onGenerate, loading, error, onBack }: {
  form: { targetRole: string; yearsExperience: string; pastRoles: string; topSkills: string; education: string };
  onChange: (form: { targetRole: string; yearsExperience: string; pastRoles: string; topSkills: string; education: string }) => void;
  onGenerate: () => void;
  loading: boolean;
  error: string;
  onBack: () => void;
}) {
  const update = (field: string, value: string) => onChange({ ...form, [field]: value });

  return (
    <div className="rounded-2xl bg-white p-5 sm:p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack} className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-bg-alt transition-colors">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-accent-warm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
          </svg>
          <span className="text-sm font-bold text-text">Smart Resume</span>
        </div>
      </div>
      <p className="text-xs text-text-muted mb-5 ml-9">Tell us about yourself so we can build your resume</p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text mb-1.5">What role are you looking for? *</label>
          <input
            value={form.targetRole}
            onChange={(e) => update("targetRole", e.target.value)}
            placeholder="e.g. Bartender, Sales Associate, Nurse..."
            className="w-full rounded-xl border border-border bg-[--color-bg] px-4 py-3 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-text-muted/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text mb-1.5">Years of experience *</label>
          <input
            type="number"
            min="0"
            max="50"
            value={form.yearsExperience}
            onChange={(e) => update("yearsExperience", e.target.value)}
            placeholder="e.g. 3"
            className="w-full rounded-xl border border-border bg-[--color-bg] px-4 py-3 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-text-muted/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text mb-1.5">Past roles and companies</label>
          <textarea
            value={form.pastRoles}
            onChange={(e) => update("pastRoles", e.target.value)}
            rows={2}
            placeholder="e.g. Bartender at Sandals Resort, Server at The Cove Bar..."
            className="w-full rounded-xl border border-border bg-[--color-bg] px-4 py-3 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none resize-none transition-all placeholder:text-text-muted/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text mb-1.5">Your top skills</label>
          <input
            value={form.topSkills}
            onChange={(e) => update("topSkills", e.target.value)}
            placeholder="e.g. Customer service, cocktail preparation, inventory..."
            className="w-full rounded-xl border border-border bg-[--color-bg] px-4 py-3 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-text-muted/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text mb-1.5">Education</label>
          <input
            value={form.education}
            onChange={(e) => update("education", e.target.value)}
            placeholder="e.g. Certificate in Hospitality, Antigua State College..."
            className="w-full rounded-xl border border-border bg-[--color-bg] px-4 py-3 text-sm text-text focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-text-muted/50"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

      <button
        onClick={onGenerate}
        disabled={loading || !form.targetRole.trim()}
        className="mt-5 w-full rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-sm shadow-primary/20"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Building your resume...
          </span>
        ) : "Generate my Resume — Free Preview"}
      </button>
    </div>
  );
}

function SmartResumePreview({ preview }: { preview: Record<string, unknown> }) {
  const data = preview as {
    summary?: string;
    experiences?: { job_title: string }[];
    education?: { degree: string }[];
    skills?: string[];
  };

  // Only show the first ~100 chars of summary as teaser
  const summaryTeaser = data.summary
    ? data.summary.slice(0, 100) + (data.summary.length > 100 ? "..." : "")
    : "";

  const sectionCount =
    (data.experiences?.length ?? 0) +
    (data.education?.length ?? 0) +
    (data.skills ? 1 : 0);

  return (
    <div className="rounded-2xl bg-white overflow-hidden" style={{ boxShadow: "var(--shadow-md)" }}>
      {/* Teaser — just summary preview */}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg className="h-4 w-4 text-accent-warm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Your Resume is Ready</span>
        </div>
        {summaryTeaser && (
          <p className="text-sm text-text-light leading-relaxed italic">&ldquo;{summaryTeaser}&rdquo;</p>
        )}
      </div>

      {/* Locked sections */}
      <div className="border-t border-border/40 bg-[--color-bg] px-5 py-4">
        <div className="space-y-2.5">
          {[
            { label: "Professional Summary", ready: true },
            { label: `${data.experiences?.length ?? 0} Work Experience${(data.experiences?.length ?? 0) !== 1 ? "s" : ""}`, ready: true },
            { label: `${data.education?.length ?? 0} Education Entr${(data.education?.length ?? 0) !== 1 ? "ies" : "y"}`, ready: true },
            { label: `${data.skills?.length ?? 0} Skills`, ready: true },
          ].map((section) => (
            <div key={section.label} className="flex items-center gap-2.5">
              <svg className="h-3.5 w-3.5 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-xs text-text-muted">{section.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-primary/15 bg-white p-4 text-center">
          <p className="text-sm font-semibold text-text">
            {sectionCount} sections ready to use
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Unlock to add everything to your resume builder. Edit anytime.
          </p>
          <a
            href="/api/stripe/smart-resume-checkout"
            className="mt-3 block w-full rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors shadow-sm shadow-primary/20"
          >
            Unlock Full Resume — EC$10
          </a>
        </div>
      </div>
    </div>
  );
}
