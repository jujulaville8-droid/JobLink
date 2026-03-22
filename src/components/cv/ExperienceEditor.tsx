"use client";

import { useState } from "react";
import type { CvWorkExperience } from "@/lib/types";

interface Props {
  initial?: CvWorkExperience;
  onSave: (data: Partial<CvWorkExperience>) => Promise<void>;
  onCancel: () => void;
}

export default function ExperienceEditor({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    job_title: initial?.job_title ?? "",
    company_name: initial?.company_name ?? "",
    location: initial?.location ?? "",
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
        job_title: form.job_title,
        company_name: form.company_name,
        location: form.location || null,
        start_date: form.start_date ? `${form.start_date}-01` : "",
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
          <label className="block text-xs font-medium text-text-light mb-1">Job Title *</label>
          <input
            required
            value={form.job_title}
            onChange={(e) => setForm((p) => ({ ...p, job_title: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            placeholder="e.g. Sales Associate"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-light mb-1">Company *</label>
          <input
            required
            value={form.company_name}
            onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            placeholder="e.g. Island Supermarket"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-light mb-1">Location</label>
        <input
          value={form.location}
          onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
          placeholder="e.g. St. John's, Antigua"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-light mb-1">Start Date *</label>
          <input
            required
            type="month"
            value={form.start_date}
            onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-light mb-1">End Date</label>
          <input
            type="month"
            value={form.end_date}
            onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
            disabled={form.is_current}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none disabled:opacity-50"
          />
          <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_current}
              onChange={(e) => setForm((p) => ({ ...p, is_current: e.target.checked, end_date: "" }))}
              className="rounded border-border text-primary focus:ring-primary/20"
            />
            <span className="text-xs text-text-light">I currently work here</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-light mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          rows={3}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none"
          placeholder="Briefly describe your responsibilities and achievements..."
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : initial ? "Save Changes" : "Add Experience"}
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
