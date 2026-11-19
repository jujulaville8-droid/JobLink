import type { Job } from "@/components/JobCard";

export interface ClusterCompany {
  id: string;
  name: string;
  logo: string | null;
  location: string | null;
}
export type GroupedJob =
  | { type: "job"; job: Job }
  | { type: "cluster"; company: ClusterCompany; jobs: Job[]; total: number };

export const VISIBLE_CLUSTER_ROLES = 2;

/** Preserve page order, emitting each eligible company at its first member. */
export function groupJobs(jobs: readonly Job[], totals: ReadonlyMap<string, number>): GroupedJob[] {
  const members = new Map<string, Job[]>();
  for (const job of jobs) {
    if (!job.company_id || job.is_confidential) continue;
    const group = members.get(job.company_id) ?? [];
    group.push(job);
    members.set(job.company_id, group);
  }

  const emitted = new Set<string>();
  const result: GroupedJob[] = [];
  for (const job of jobs) {
    const id = !job.is_confidential ? job.company_id : null;
    const group = id ? members.get(id) : undefined;
    if (!id || !group || group.length < 3) {
      result.push({ type: "job", job });
    } else if (!emitted.has(id)) {
      emitted.add(id);
      result.push({
        type: "cluster",
        company: { id, name: job.company_name, logo: job.company_logo ?? null, location: job.company_location ?? null },
        jobs: group,
        total: Math.max(group.length, totals.get(id) ?? 0),
      });
    }
  }
  return result;
}
