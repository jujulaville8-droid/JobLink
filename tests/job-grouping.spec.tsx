import { expect, it } from "vitest";
import { groupJobs, VISIBLE_CLUSTER_ROLES } from "@/lib/job-grouping";
import type { Job } from "@/components/JobCard";

const job = (id: string, company_id: string | null = "a", extra: Partial<Job> = {}): Job => ({
  id, company_id, company_name: company_id ?? "Unknown", title: id,
  location: null, job_type: "full_time", created_at: "2026-11-01", ...extra,
});
const roles = (n: number, company = "a") => Array.from({ length: n }, (_, i) => job(company + i, company));

it("groups seven interleaved roles at their first position, preserving singles and member order", () => {
  const members = roles(7);
  const single1 = job("single1", "b"), single2 = job("single2", "c");
  const result = groupJobs([single1, members[0], single2, ...members.slice(1)], new Map());
  expect(result.map((item) => item.type === "job" ? item.job.id : item.company.id)).toEqual(["single1", "a", "single2"]);
  const cluster = result[1];
  if (cluster.type !== "cluster") throw new Error("Expected cluster");
  expect(cluster.jobs).toEqual(members);
  expect(cluster.jobs.slice(0, VISIBLE_CLUSTER_ROLES)).toHaveLength(2);
  expect(cluster.jobs.slice(VISIBLE_CLUSTER_ROLES)).toHaveLength(5);
});

it("keeps two roles flat even with a larger company total", () => {
  expect(groupJobs(roles(2), new Map([["a", 7]])).map((item) => item.type)).toEqual(["job", "job"]);
});

it("clusters exactly three roles with one collapsed", () => {
  const [cluster] = groupJobs(roles(3), new Map());
  expect(cluster.type).toBe("cluster");
  if (cluster.type === "cluster") expect(cluster.jobs.slice(VISIBLE_CLUSTER_ROLES)).toHaveLength(1);
});

it("excludes confidential roles from membership and the threshold", () => {
  const jobs = [...roles(2), ...roles(3).map((role) => ({ ...role, id: role.id + "secret", is_confidential: true }))];
  expect(groupJobs(jobs, new Map()).every((item) => item.type === "job")).toBe(true);
  const result = groupJobs([...roles(3), job("secret", "a", { is_confidential: true })], new Map());
  expect(result.map((item) => item.type)).toEqual(["cluster", "job"]);
});

it("never groups missing company IDs", () => {
  expect(groupJobs(roles(3).map((role) => ({ ...role, company_id: null })), new Map()).every((item) => item.type === "job")).toBe(true);
});

it("positions two clusters by their first surviving members", () => {
  const a = roles(3), b = roles(4, "b");
  const result = groupJobs([b[0], a[0], ...a.slice(1), ...b.slice(1)], new Map());
  expect(result.map((item) => item.type === "cluster" && item.company.id)).toEqual(["b", "a"]);
});

it("retains featured rank and badge data without sorting members", () => {
  const featured = job("featured", "a", { is_featured: true });
  const result = groupJobs([featured, job("single", "b"), ...roles(3)], new Map());
  expect(result[0].type).toBe("cluster");
  if (result[0].type === "cluster") expect(result[0].jobs[0]).toBe(featured);
});

it("uses company totals for overflow and never counts below page membership", () => {
  const [cluster] = groupJobs(roles(3), new Map([["a", 7]]));
  if (cluster.type !== "cluster") throw new Error("Expected cluster");
  expect(cluster.total).toBe(7);
  expect(cluster.total > cluster.jobs.length).toBe(true);
  expect(groupJobs(roles(3), new Map([["a", 1]]))[0]).toMatchObject({ total: 3 });
});
