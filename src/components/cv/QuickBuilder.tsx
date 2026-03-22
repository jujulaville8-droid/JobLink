"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SKILL_SUGGESTIONS = [
  "Customer Service", "Communication", "Teamwork", "Microsoft Office",
  "Problem Solving", "Time Management", "Leadership", "Sales",
];

interface Props {
  onComplete?: () => void;
  onSkip?: () => void;
}

export default function QuickBuilder({ onComplete, onSkip }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Job title
  const [jobTitle, setJobTitle] = useState("");

  // Step 2: Experience
  const [experiences, setExperiences] = useState<{
    job_title: string;
    company_name: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
  }[]>([{ job_title: "", company_name: "", start_date: "", end_date: "", is_current: false }]);

  // Step 3: Education
  const [education, setEducation] = useState({ institution: "", degree: "", field_of_study: "" });

  // Step 4: Skills
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");

  async function saveStep() {
    setSaving(true);
    try {
      if (step === 1 && jobTitle.trim()) {
        await fetch("/api/cv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_title: jobTitle }),
        });
      }

      if (step === 2) {
        for (const exp of experiences) {
          if (!exp.job_title || !exp.company_name || !exp.start_date) continue;
          await fetch("/api/cv/experience", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...exp,
              start_date: `${exp.start_date}-01`,
              end_date: exp.is_current ? null : exp.end_date ? `${exp.end_date}-01` : null,
            }),
          });
        }
      }

      if (step === 3 && education.institution && education.degree) {
        await fetch("/api/cv/education", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(education),
        });
      }

      if (step === 4 && skills.length > 0) {
        await fetch("/api/cv/skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skills: skills.map((name) => ({ name })) }),
        });
      }

      await fetch("/api/cv/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "cv_builder_step_completed", metadata: { step } }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    await saveStep();
    if (step < 4) {
      setStep(step + 1);
    } else {
      await fetch("/api/cv/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "cv_quick_builder_completed" }),
      });
      if (onComplete) onComplete();
      else router.push("/profile/cv");
    }
  }

  function handleSkip() {
    if (step < 4) {
      setStep(step + 1);
    } else {
      if (onSkip) onSkip();
      else router.push("/dashboard");
    }
  }

  function addSkill(name: string) {
    const trimmed = name.trim();
    if (!trimmed || skills.includes(trimmed)) return;
    setSkills((prev) => [...prev, trimmed]);
    setSkillInput("");
  }

  function updateExp(index: number, field: string, value: string | boolean) {
    setExperiences((prev) => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex-1">
            <div className={`h-1.5 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-border"}`} />
          </div>
        ))}
        <span className="text-xs text-text-muted ml-1">Step {step} of 4</span>
      </div>

      {/* Step 1: Job Title */}
      {step === 1 && (
        <div>
          <h2 className="font-display text-xl text-text">What&apos;s your most recent job title?</h2>
          <p className="text-sm text-text-light mt-1">This helps employers find you.</p>
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="w-full mt-5 rounded-lg border border-border px-4 py-3 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            placeholder="e.g. Sales Associate, Software Developer, Nurse..."
            autoFocus
          />
        </div>
      )}

      {/* Step 2: Experience */}
      {step === 2 && (
        <div>
          <h2 className="font-display text-xl text-text">Add your work experience</h2>
          <p className="text-sm text-text-light mt-1">Start with your most recent role.</p>
          <div className="mt-5 space-y-4">
            {experiences.map((exp, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border p-4">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={exp.job_title}
                    onChange={(e) => updateExp(i, "job_title", e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                    placeholder="Job title"
                  />
                  <input
                    value={exp.company_name}
                    onChange={(e) => updateExp(i, "company_name", e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                    placeholder="Company"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="month"
                    value={exp.start_date}
                    onChange={(e) => updateExp(i, "start_date", e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                  />
                  <input
                    type="month"
                    value={exp.end_date}
                    onChange={(e) => updateExp(i, "end_date", e.target.value)}
                    disabled={exp.is_current}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none disabled:opacity-50"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exp.is_current}
                    onChange={(e) => updateExp(i, "is_current", e.target.checked)}
                    className="rounded border-border text-primary"
                  />
                  <span className="text-xs text-text-light">I currently work here</span>
                </label>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setExperiences((prev) => [...prev, { job_title: "", company_name: "", start_date: "", end_date: "", is_current: false }])}
              className="text-xs font-medium text-primary hover:text-primary-dark transition-colors"
            >
              + Add another role
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Education */}
      {step === 3 && (
        <div>
          <h2 className="font-display text-xl text-text">Add your education</h2>
          <p className="text-sm text-text-light mt-1">Your highest level of education.</p>
          <div className="mt-5 space-y-3">
            <input
              value={education.institution}
              onChange={(e) => setEducation((p) => ({ ...p, institution: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
              placeholder="School or institution"
            />
            <select
              value={education.degree}
              onChange={(e) => setEducation((p) => ({ ...p, degree: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            >
              <option value="">Select degree...</option>
              <option value="High School Diploma">High School Diploma</option>
              <option value="Associate's Degree">Associate&apos;s Degree</option>
              <option value="Bachelor's Degree">Bachelor&apos;s Degree</option>
              <option value="Master's Degree">Master&apos;s Degree</option>
              <option value="PhD">PhD</option>
              <option value="Certificate">Certificate</option>
              <option value="Diploma">Diploma</option>
              <option value="Other">Other</option>
            </select>
            <input
              value={education.field_of_study}
              onChange={(e) => setEducation((p) => ({ ...p, field_of_study: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
              placeholder="Field of study (optional)"
            />
          </div>
        </div>
      )}

      {/* Step 4: Skills */}
      {step === 4 && (
        <div>
          <h2 className="font-display text-xl text-text">What are your top skills?</h2>
          <p className="text-sm text-text-light mt-1">Add at least 3 to help employers find you.</p>
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 min-h-[42px] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
              {skills.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-medium px-2.5 py-1">
                  {s}
                  <button type="button" onClick={() => setSkills((prev) => prev.filter((_, j) => j !== i))} className="hover:text-red-500">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(skillInput); } }}
                className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
                placeholder={skills.length === 0 ? "Type a skill and press Enter..." : "Add more..."}
              />
            </div>
            <div className="mt-3">
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Suggestions</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {SKILL_SUGGESTIONS.filter((s) => !skills.includes(s)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addSkill(s)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-alt text-text-light text-xs px-2.5 py-1 hover:border-primary hover:text-primary transition-colors"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mt-8">
        <button
          type="button"
          onClick={handleSkip}
          className="text-sm text-text-muted hover:text-text transition-colors"
        >
          Skip {step < 4 ? "this step" : "for now"}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={saving}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : step < 4 ? "Next" : "Finish"}
        </button>
      </div>
    </div>
  );
}
