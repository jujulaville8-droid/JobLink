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

export default function CvBuilderPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [cv, setCv] = useState<CvFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<EditingSection>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    if (!authLoading && user) fetchCv();
  }, [user, authLoading, fetchCv]);

  // Auto-save job_title and summary with debounce
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

  // Create CV profile if none exists
  async function createCv() {
    setLoading(true);
    await fetch("/api/cv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    await fetchCv();
  }

  // Experience CRUD
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

  // Education CRUD
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

  // Skills save
  async function saveSkills(skills: { name: string }[]) {
    await fetch("/api/cv/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills }),
    });
    await fetchCv();
  }

  // Awards CRUD
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

  // Certifications CRUD
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

  // PDF Export
  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/cv/export");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "CV.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
      setMenuOpen(false);
    }
  }

  // Delete CV
  async function handleDeleteCv() {
    if (!confirm("Delete your entire CV? This cannot be undone.")) return;
    await fetch("/api/cv", { method: "DELETE" });
    setCv(null);
    setMenuOpen(false);
  }

  if (authLoading || loading) {
    return (
      <div>
        <h1 className="font-display text-2xl text-text sm:text-3xl">CV Builder</h1>
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-white p-5 animate-pulse">
              <div className="h-4 w-1/3 skeleton rounded mb-3" />
              <div className="h-3 w-2/3 skeleton rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No CV yet — show CTA
  if (!cv) {
    return (
      <div>
        <h1 className="font-display text-2xl text-text sm:text-3xl">CV Builder</h1>
        <div className="mt-10 text-center max-w-md mx-auto">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <svg className="h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="mt-4 font-display text-xl text-text">Build your CV</h2>
          <p className="mt-2 text-sm text-text-light">
            Create a professional CV that employers can find. It only takes a few minutes.
          </p>
          <button
            onClick={createCv}
            className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    );
  }

  const completion = calculateCvCompletion(cv);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-text sm:text-3xl">CV Builder</h1>
          <p className="mt-1 text-sm text-text-light">
            {saving ? "Saving..." : "Build and manage your professional CV."}
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-bg-alt transition-colors"
          >
            <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-20 w-48 rounded-xl border border-border bg-white shadow-lg py-1.5">
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-bg-alt transition-colors disabled:opacity-50"
                >
                  <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {exporting ? "Generating..." : "Download PDF"}
                </button>
                <button
                  onClick={handleDeleteCv}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                  Delete CV
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Completion bar */}
      <div className="mt-5">
        <CvCompletionBar percentage={completion.percentage} missing={completion.missing} />
      </div>

      <div className="mt-6 space-y-6">
        {/* Contact Info (read-only) */}
        <Section title="Contact Information" hint="Edit from your profile page">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <InfoRow label="Name" value={[cv.contact.first_name, cv.contact.last_name].filter(Boolean).join(" ") || "—"} />
            <InfoRow label="Email" value={cv.contact.email || "—"} />
            <InfoRow label="Phone" value={cv.contact.phone || "—"} />
            <InfoRow label="Location" value={cv.contact.location || "—"} />
          </div>
          <a href="/profile" className="inline-block mt-3 text-xs font-medium text-primary hover:text-primary-dark transition-colors">
            Edit contact info →
          </a>
        </Section>

        {/* Job Title */}
        <Section title="Job Title">
          <input
            value={cv.profile.job_title ?? ""}
            onChange={(e) => handleFieldChange("job_title", e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            placeholder="e.g. Software Developer, Sales Manager, Nurse..."
          />
        </Section>

        {/* Summary */}
        <Section title="Professional Summary">
          <textarea
            value={cv.profile.summary ?? ""}
            onChange={(e) => handleFieldChange("summary", e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none"
            placeholder="Write a brief summary of your professional background, key skills, and career goals..."
          />
        </Section>

        {/* Work Experience */}
        <Section
          title="Work Experience"
          onAdd={() => { setEditingSection("experience"); setEditingId(null); }}
        >
          {editingSection === "experience" && !editingId && (
            <ExperienceEditor
              onSave={saveExperience}
              onCancel={() => setEditingSection(null)}
            />
          )}
          {cv.experiences.map((exp) =>
            editingSection === "experience" && editingId === exp.id ? (
              <ExperienceEditor
                key={exp.id}
                initial={exp}
                onSave={saveExperience}
                onCancel={() => { setEditingSection(null); setEditingId(null); }}
              />
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
            <EmptyHint text="No work experience added yet." />
          )}
        </Section>

        {/* Education */}
        <Section
          title="Education"
          onAdd={() => { setEditingSection("education"); setEditingId(null); }}
        >
          {editingSection === "education" && !editingId && (
            <EducationEditor
              onSave={saveEducation}
              onCancel={() => setEditingSection(null)}
            />
          )}
          {cv.education.map((edu) =>
            editingSection === "education" && editingId === edu.id ? (
              <EducationEditor
                key={edu.id}
                initial={edu}
                onSave={saveEducation}
                onCancel={() => { setEditingSection(null); setEditingId(null); }}
              />
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
            <EmptyHint text="No education added yet." />
          )}
        </Section>

        {/* Skills */}
        <Section title="Skills">
          <SkillsEditor skills={cv.skills} onSave={saveSkills} />
        </Section>

        {/* Awards */}
        <Section
          title="Awards"
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
            <EmptyHint text="No awards added yet." />
          )}
        </Section>

        {/* Certifications */}
        <Section
          title="Certifications"
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
            <EmptyHint text="No certifications added yet." />
          )}
        </Section>
      </div>
    </div>
  );
}

// ─── Reusable sub-components ─────────────────────────────────────────

function Section({ title, hint, onAdd, children }: { title: string; hint?: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div>
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {hint && <p className="text-[11px] text-text-muted mt-0.5">{hint}</p>}
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>
      <div className="p-5 space-y-3">{children}</div>
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
    <div className="group flex items-start justify-between rounded-lg border border-border/60 p-3.5 hover:border-border transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{title}</p>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        {date && <p className="text-xs text-text-muted mt-0.5">{date}</p>}
        {description && <p className="text-xs text-text-light mt-1.5 line-clamp-2">{description}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-primary hover:bg-primary/5 transition-colors">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button onClick={onDelete} className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors">
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
      <span className="text-xs text-text-muted">{label}</span>
      <p className="text-sm text-text">{value}</p>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-text-muted italic py-2">{text}</p>;
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
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.02] p-4">
      {fields.map((f) => (
        <div key={f}>
          <label className="block text-xs font-medium text-text-light mb-1">{labels[f] || f}</label>
          {f === "description" ? (
            <textarea
              value={form[f] ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none"
            />
          ) : (
            <input
              required={labels[f]?.includes("*")}
              type={dateFields.includes(f) ? "month" : "text"}
              value={form[f] ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? "Saving..." : saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-text-light hover:text-text hover:bg-bg-alt transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
