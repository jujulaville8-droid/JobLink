import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import JobResults from "@/components/JobResults";
import JobCard from "@/components/JobCard";
import type { JobResultsData, JobSearchParams } from "@/lib/job-results";
import { closedJobIdFilter } from "@/lib/job-closures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/jobs",
}));
vi.mock("@/components/AlertToggle", () => ({ default: () => null }));
vi.mock("@/lib/job-results", () => ({ JOBS_PER_PAGE: 12, getJobResults: vi.fn() }));

afterEach(cleanup);

const company = { id: "a", company_name: "Acme", logo_url: null, location: "Antigua", is_pro: false, is_confidential: false };
const roles = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `role-${i}`, title: `Role ${i}`, company, is_confidential: false,
  location: "Antigua", job_type: "full_time", created_at: "2026-11-01",
  is_featured: false, salary_min: 2000, salary_visible: true,
}));
type Row = Omit<ReturnType<typeof roles>[number], "company"> & { company: typeof company | null };
function fixture(jobs: Row[], total = jobs.length, totalsError = false) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockResolvedValue({ data: Array.from({ length: total }, () => ({ company_id: "a" })), error: totalsError ? { message: "Unavailable" } : null }),
  };
  const from = vi.fn(() => query);
  const data = { jobs, count: 25, error: null, currentPage: 2, supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) }, from,
  } } as unknown as JobResultsData;
  return { data, from, query };
}
async function output(jobs: Row[], options: { params?: JobSearchParams; split?: boolean; selectedId?: string; total?: number; totalsError?: boolean } = {}) {
  const db = fixture(jobs, options.total, options.totalsError);
  const element = await JobResults({
    searchParams: options.params ?? {}, prefetchedResults: db.data,
    split: options.split === false ? undefined : { query: "page=2", selectedId: options.selectedId ?? "elsewhere" },
  });
  return { ...db, element };
}

it("renders three roles as one standard cluster with public totals and an unlinked overflow", async () => {
  const { element, query } = await output(roles(3), { total: 7 });
  const { container } = render(element);
  expect(screen.getByText("7 open roles")).toBeTruthy();
  expect(screen.getByText(/7 open roles at Acme; 3 shown/)).toBeTruthy();
  expect(container.querySelectorAll("section")).toHaveLength(1);
  expect(container.querySelector('a[href^="/companies"]')).toBeNull();
  expect(screen.getByText("Acme").tagName).toBe("H3");
  expect(query.eq.mock.calls).toEqual([["status", "active"], ["is_confidential", false]]);
  expect(query.in).toHaveBeenCalledWith("company_id", ["a"]);
  expect(query.not).toHaveBeenCalledWith("id", "in", closedJobIdFilter());
  expect(screen.getByText("25")).toBeTruthy();
  expect(container.querySelector('a[href*="page=3"]')).toBeTruthy();
});

it("keeps two roles flat", async () => {
  render((await output(roles(2), { total: 7 })).element);
  expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  expect(screen.getAllByText("Acme")).toHaveLength(2);
});

it.each([{ q: "cook" }, { location: "Antigua" }, { job_type: "full_time" }, { job_type: ["contract"] }, { category: "Hospitality" }, { category: "unknown" }])("keeps filtered results flat and skips totals: %j", async (params) => {
  const { element, from } = await output(roles(3), { params });
  render(element);
  expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  expect(from).not.toHaveBeenCalled();
});

it("never groups the dashboard or queries its totals", async () => {
  const { element, from } = await output(roles(3), { split: false });
  render(element);
  expect(screen.getAllByText("Acme")).toHaveLength(3);
  expect(from).not.toHaveBeenCalled();
});

it("server renders every role link and toggles only hidden on the existing region", async () => {
  const { element } = await output(roles(7));
  const html = renderToString(element);
  const document = new DOMParser().parseFromString(html, "text/html");
  expect(document.querySelectorAll('a[href^="/jobs/"]')).toHaveLength(7);
  expect(document.querySelector("[hidden]")?.querySelectorAll('a[href^="/jobs/"]')).toHaveLength(5);
  render(element);
  const button = screen.getByRole("button", { name: "Show all 7 roles at Acme" });
  const region = window.document.getElementById(button.getAttribute("aria-controls")!)!;
  const last = screen.getByText("Role 6");
  expect(region.hidden).toBe(true);
  fireEvent.click(button);
  expect(region.hidden).toBe(false);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(button);
  expect(region.hidden).toBe(true);
  expect(screen.getByText("Role 6")).toBe(last);
});

it.each(["listing", "company", "missing"])("never groups confidential or missing employers: %s", async (kind) => {
  const jobs = roles(3).map((role) => ({
    ...role, is_confidential: kind === "listing",
    company: kind === "missing" ? null : { ...company, is_confidential: kind === "company" },
  }));
  const { element, from } = await output(jobs);
  render(element);
  expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  expect(from).not.toHaveBeenCalled();
  if (kind !== "missing") expect(screen.queryByText("Acme")).toBeNull();
});

it("a confidential third listing cannot satisfy the threshold", async () => {
  const jobs = roles(3);
  jobs[2].is_confidential = true;
  render((await output(jobs)).element);
  expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
});

it("expands the selected cluster on load, including a previously collapsed role", async () => {
  render((await output(roles(7), { selectedId: "role-6" })).element);
  expect(screen.getByRole("button", { name: "Show fewer roles" }).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: /View Role 6/ }).getAttribute("aria-current")).toBe("true");
});

it.each(["featured", "pro"])("preserves %s badges without amber cluster or row chrome", async (kind) => {
  const jobs = roles(3);
  if (kind === "featured") jobs[0].is_featured = true;
  else jobs.forEach((job) => { job.company = { ...company, is_pro: true }; });
  const { container } = render((await output(jobs)).element);
  expect(screen.getAllByText("Featured")).toHaveLength(kind === "featured" ? 2 : 4);
  expect(container.querySelector("section")?.className).toBe("rounded-card border border-border bg-white");
  expect(container.querySelector(".job-magic-card")).toBeNull();
  expect(container.querySelector(".border-amber-300\\/60")).toBeNull();
  expect(container.querySelectorAll("img")).toHaveLength(1);
});

it("falls back to flat cards when totals fail", async () => {
  render((await output(roles(3), { totalsError: true })).element);
  expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
});

it("leaves the default JobCard markup identical to explicit inCluster=false", () => {
  const job = { ...roles(1)[0], company_name: "Acme" };
  expect(renderToString(<JobCard job={job} highlight />)).toBe(renderToString(<JobCard job={job} highlight inCluster={false} />));
});
