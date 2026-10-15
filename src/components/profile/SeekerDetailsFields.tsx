"use client";

import { useState } from "react";
import {
  AVAILABILITY_OPTIONS, MARITAL_STATUS_OPTIONS, NOTICE_PERIOD_OPTIONS, SENSITIVE_DETAILS_NOTICE,
  type Availability, type MaritalStatus, type NoticePeriod, type SeekerDetails, type SensitiveDetails,
} from "@/lib/seeker-details";

const inputClass = "w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function YesNo({ id, label, value, onChange }: { id: string; label: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text-light mb-1">{label}</label>
      <select
        id={id}
        value={value === null ? "" : value ? "yes" : "no"}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "yes")}
        className={inputClass}
      >
        <option value="">Prefer not to say</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
}

function TagList({ id, label, placeholder, values, onChange }: { id: string; label: string; placeholder: string; values: string[]; onChange: (values: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const value = input.trim().replace(/\s+/g, " ");
    if (value && !values.some((item) => item.toLowerCase() === value.toLowerCase())) onChange([...values, value.slice(0, 80)]);
    setInput("");
  };
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text-light mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={input}
          maxLength={80}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className={`flex-1 ${inputClass}`}
          placeholder={placeholder}
        />
        <button type="button" onClick={add} className="rounded-[10px] bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-all duration-200">
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span key={value} className="inline-flex items-center gap-1 rounded-md bg-bg-alt px-2.5 py-1 text-xs font-medium text-text-light">
              {value}
              <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((item) => item !== value))} className="ml-0.5 text-text-muted hover:text-text-light">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Optional practical work details plus admin-only sensitive details. */
export default function SeekerDetailsFields({
  details, sensitive, onDetailsChange, onSensitiveChange,
}: {
  details: SeekerDetails;
  sensitive: SensitiveDetails;
  onDetailsChange: (details: SeekerDetails) => void;
  onSensitiveChange: (sensitive: SensitiveDetails) => void;
}) {
  const set = <K extends keyof SeekerDetails>(key: K, value: SeekerDetails[K]) => onDetailsChange({ ...details, [key]: value });
  const toggleAvailability = (value: Availability) => set(
    "availability",
    details.availability.includes(value) ? details.availability.filter((item) => item !== value) : [...details.availability, value],
  );

  return (
    <div className="space-y-6">
      <section aria-labelledby="work-details-heading" className="space-y-5 rounded-xl border border-border/60 p-4 sm:p-5">
        <div>
          <h3 id="work-details-heading" className="text-sm font-semibold text-text">Work details <span className="font-normal text-text-muted">(all optional)</span></h3>
          <p className="mt-0.5 text-xs text-text-muted">Employers you apply to can see these answers.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <YesNo id="currently-employed" label="Are you currently employed?" value={details.currently_employed} onChange={(v) => set("currently_employed", v)} />
          <YesNo id="willing-to-relocate" label="Willing to relocate?" value={details.willing_to_relocate} onChange={(v) => set("willing_to_relocate", v)} />
          <YesNo id="own-transport" label="Do you have your own transport?" value={details.has_own_transport} onChange={(v) => set("has_own_transport", v)} />
          <YesNo id="drivers-licence" label="Do you have a driver's licence?" value={details.has_drivers_licence} onChange={(v) => set("has_drivers_licence", v)} />
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-text-light mb-2">Availability</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(AVAILABILITY_OPTIONS) as [Availability, string][]).map(([value, label]) => (
              <label key={value} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${details.availability.includes(value) ? "border-primary bg-primary/5 text-primary" : "border-border text-text-light"}`}>
                <input type="checkbox" className="accent-primary" checked={details.availability.includes(value)} onChange={() => toggleAvailability(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="notice-period" className="block text-sm font-medium text-text-light mb-1">Notice period</label>
            <select id="notice-period" value={details.notice_period ?? ""} onChange={(e) => set("notice_period", (e.target.value || null) as NoticePeriod | null)} className={inputClass}>
              <option value="">Prefer not to say</option>
              {Object.entries(NOTICE_PERIOD_OPTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="earliest-start" className="block text-sm font-medium text-text-light mb-1">Earliest start date</label>
            <input id="earliest-start" type="date" value={details.earliest_start_date ?? ""} onChange={(e) => set("earliest_start_date", e.target.value || null)} className={inputClass} />
          </div>
        </div>

        <TagList id="languages" label="Languages" placeholder="e.g. English, Spanish — press Enter" values={details.languages} onChange={(v) => set("languages", v)} />
        <TagList id="certifications" label="Certifications" placeholder="e.g. Food Handler's Permit — press Enter" values={details.certifications} onChange={(v) => set("certifications", v)} />
      </section>

      <section aria-labelledby="personal-details-heading" className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
        <div>
          <h3 id="personal-details-heading" className="text-sm font-semibold text-text">Personal details</h3>
          <p className="mt-0.5 text-xs font-medium text-amber-800">{SENSITIVE_DETAILS_NOTICE}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="marital-status" className="block text-sm font-medium text-text-light mb-1">Marital status <span className="font-normal text-text-muted">(optional, voluntary, only visible to JobLinks admin)</span></label>
            <select id="marital-status" value={sensitive.marital_status ?? ""} onChange={(e) => onSensitiveChange({ ...sensitive, marital_status: (e.target.value || null) as MaritalStatus | null })} className={inputClass}>
              <option value="">Not answered</option>
              {Object.entries(MARITAL_STATUS_OPTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="children-count" className="block text-sm font-medium text-text-light mb-1">Number of children <span className="font-normal text-text-muted">(optional, voluntary, only visible to JobLinks admin)</span></label>
            <input
              id="children-count"
              type="number"
              min={0}
              max={20}
              value={sensitive.children_count ?? ""}
              onChange={(e) => onSensitiveChange({ ...sensitive, children_count: e.target.value === "" ? null : Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)) })}
              className={inputClass}
              placeholder="Not answered"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
