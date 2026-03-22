"use client";

import { useState, useRef } from "react";
import type { CvSkill } from "@/lib/types";

const SUGGESTIONS = [
  "Customer Service", "Communication", "Teamwork", "Microsoft Office",
  "Problem Solving", "Time Management", "Leadership", "Sales",
  "Data Entry", "Accounting", "Social Media", "Project Management",
];

interface Props {
  skills: CvSkill[];
  onSave: (skills: { name: string }[]) => Promise<void>;
}

export default function SkillsEditor({ skills: initialSkills, onSave }: Props) {
  const [skills, setSkills] = useState<string[]>(initialSkills.map((s) => s.name));
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addSkill(name: string) {
    const trimmed = name.trim();
    if (!trimmed || skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
    setSkills((prev) => [...prev, trimmed]);
    setInput("");
    inputRef.current?.focus();
  }

  function removeSkill(index: number) {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(input);
    }
    if (e.key === "Backspace" && !input && skills.length > 0) {
      removeSkill(skills.length - 1);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(skills.map((name) => ({ name })));
    } finally {
      setSaving(false);
    }
  }

  const unusedSuggestions = SUGGESTIONS.filter(
    (s) => !skills.some((sk) => sk.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 min-h-[42px] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
        {skills.map((skill, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-1"
          >
            {skill}
            <button
              type="button"
              onClick={() => removeSkill(i)}
              className="hover:text-red-500 transition-colors"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-[120px] text-sm text-text outline-none bg-transparent"
          placeholder={skills.length === 0 ? "Type a skill and press Enter..." : "Add more..."}
        />
      </div>

      {unusedSuggestions.length > 0 && (
        <div>
          <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Suggestions</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {unusedSuggestions.slice(0, 8).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addSkill(s)}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 text-blue-600 text-xs px-2.5 py-1 hover:border-blue-400 hover:text-blue-700 transition-colors"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Skills"}
      </button>
    </div>
  );
}
