"use client";

import { useState } from "react";
import type { CvEducation } from "@/lib/types";
import MonthYearPicker from "@/components/cv/MonthYearPicker";

const DEGREE_OPTIONS = [
  "High School Diploma",
  "Associate's Degree",
  "Bachelor's Degree",
  "Master's Degree",
  "PhD",
  "Certificate",
  "Diploma",
  "Other",
];

interface Props {
  initial?: CvEducation;
  onSave: (data: Partial<CvEducation>) => Promise<void>;
  onCancel: () => void;
}

export default function EducationEditor({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    institution: initial?.institution ?? "",
    degree: initial?.degree ?? "",
    field_of_study: initial?.field_of_study ?? "",
    start_date: initial?.start_date?.substring(0, 7) ?? "",
    end_date: initial?.end_date?.substring(0, 7) ?? "",
    is_current: initial?.is_current ?? false,
    description: initial?.description ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...initial,
        institution: form.institution,
        degree: form.degree,
        field_of_study: form.field_of_study || null,
        start_date: form.start_date ? `${form.start_date}-01` : null,
        end_date: form.is_current ? null : form.end_date ? `${form.end_date}-01` : null,
        is_current: form.is_current,
        description: form.description || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.02] p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-light mb-1">School / Institution *</label>
          <input
            required
            value={form.institution}
            onChange={(e) => setForm((p) => ({ ...p, institution: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            placeholder="e.g. University of the West Indies"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-light mb-1">Degree *</label>
          <select
            required
            value={form.degree}
            onChange={(e) => setForm((p) => ({ ...p, degree: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
          >
            <option value="">Select degree...</option>
            {DEGREE_OPTIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-light mb-1">Field of Study</label>
        <input
          value={form.field_of_study}
          onChange={(e) => setForm((p) => ({ ...p, field_of_study: e.target.value }))}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
          placeholder="e.g. Business Administration"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-light mb-1">Start Date</label>
          <MonthYearPicker
            value={form.start_date}
            onChange={(v) => setForm((p) => ({ ...p, start_date: v }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-light mb-1">End Date</label>
          <MonthYearPicker
            value={form.end_date}
            onChange={(v) => setForm((p) => ({ ...p, end_date: v }))}
            disabled={form.is_current}
          />
          <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_current}
              onChange={(e) => setForm((p) => ({ ...p, is_current: e.target.checked, end_date: "" }))}
              className="rounded border-border text-primary focus:ring-primary/20"
            />
            <span className="text-xs text-text-light">Currently studying here</span>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : initial ? "Save Changes" : "Add Education"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-text-light hover:text-text hover:bg-bg-alt transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
