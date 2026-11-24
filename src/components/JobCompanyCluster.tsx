"use client";

import { useId, useState } from "react";
import JobCard from "@/components/JobCard";
import { displayJobLocation } from "@/lib/job-location";
import { VISIBLE_CLUSTER_ROLES, type GroupedJob } from "@/lib/job-grouping";

type Cluster = Extract<GroupedJob, { type: "cluster" }>;

export default function JobCompanyCluster({
  company, jobs, total, defaultExpanded = false, selectedId, query = "",
  savedJobIds = [], loggedIn = false,
}: Omit<Cluster, "type"> & {
  defaultExpanded?: boolean;
  selectedId?: string;
  query?: string;
  savedJobIds?: string[];
  loggedIn?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const regionId = useId();
  const featured = jobs.some((job) => job.is_featured || job.is_pro_company);
  const location = displayJobLocation(company.location, null);
  const renderRole = (job: Cluster["jobs"][number]) => (
    <JobCard key={job.id} job={job} inCluster loggedIn={loggedIn}
      isSaved={savedJobIds.includes(job.id)} selected={selectedId === job.id}
      selectHref={`/jobs?${query ? `${query}&` : ""}job=${encodeURIComponent(job.id)}`} />
  );

  return (
    <section className="rounded-card border border-border bg-white">
      <div className="flex min-h-14 flex-wrap items-center gap-3 p-4">
        <img src={company.logo || "/logo-icon.png"} alt={company.logo ? company.name : ""}
          className={`h-11 w-11 shrink-0 rounded-xl border border-border ${company.logo ? "object-cover" : "object-contain bg-white p-1"}`} />
        <div className="min-w-0 flex-1 basis-32">
          {/* TODO: wrap the name in a Link when /companies/[id] ships. */}
          <h3 className="font-semibold text-text break-words">{company.name}</h3>
          {location && <p className="text-xs text-text-light">{location}</p>}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm font-medium text-text">{total} open roles</span>
          {featured && <span className="shrink-0 bg-gradient-to-r from-amber-400 to-amber-500 text-white text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full tracking-wider shadow-sm shadow-amber-300/40">Featured</span>}
        </div>
      </div>
      <div className="divide-y divide-border border-t border-border">
        {jobs.slice(0, VISIBLE_CLUSTER_ROLES).map(renderRole)}
      </div>
      <button type="button" aria-expanded={expanded} aria-controls={regionId}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-12 w-full items-center justify-between gap-2 border-t border-border px-4 py-3 text-left text-sm font-medium text-primary cursor-pointer">
        {expanded ? "Show fewer roles" : `Show all ${total} roles at ${company.name}`}
        <svg aria-hidden="true" className={`h-4 w-4 shrink-0 ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div id={regionId} hidden={!expanded} className="divide-y divide-border border-t border-border">
        {jobs.slice(VISIBLE_CLUSTER_ROLES).map(renderRole)}
        {total > jobs.length && (
          /* TODO: replace this paragraph with a Link when /companies/[id] ships. */
          <p className="px-4 py-3 text-sm text-text-light">{total} open roles at {company.name}; {jobs.length} shown on this page.</p>
        )}
      </div>
    </section>
  );
}
