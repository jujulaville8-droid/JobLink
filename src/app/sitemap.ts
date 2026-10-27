import { closedJobIdFilter } from "@/lib/job-closures";
import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { INDUSTRIES } from "@/lib/types";

const BASE_URL = "https://joblinkantigua.com";
const JOB_PAGE_SIZE = 1000;
const COMPANY_BATCH_SIZE = 100;

type SitemapJob = {
  id: string;
  company_id: string;
  category: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

// updated_at is bumped by the job_listings_set_updated_at trigger on content or
// status changes. Fall back to created_at; invalid dates emit no lastmod.
function jobLastModified(job: SitemapJob): Date | undefined {
  const raw = job.updated_at ?? job.created_at;
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  // Static pages carry no lastModified: a request timestamp is not a content
  // modification date. Job pages use their stored listing timestamp below.
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/jobs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/employers`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/employers/hiring-help`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Listings remain available until their status is changed manually; neither
  // their age nor a legacy expires_at date removes them from the sitemap.
  // Page in stable ID order so the Data API row limit cannot hide an industry.
  const jobs = new Map<string, SitemapJob>();
  for (let start = 0; ; start += JOB_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("job_listings")
      .select("id, company_id, category, created_at, updated_at")
      .eq("status", "active")
      .not("id", "in", closedJobIdFilter())
      .order("id", { ascending: true })
      .range(start, start + JOB_PAGE_SIZE - 1);

    // A database outage must not publish a successful but incomplete sitemap.
    if (error) throw new Error("Unable to load live jobs for sitemap", { cause: error });
    for (const job of data ?? []) jobs.set(job.id, job);
    if (!data || data.length < JOB_PAGE_SIZE) break;
  }
  const liveJobs = [...jobs.values()];

  const jobPages: MetadataRoute.Sitemap = liveJobs.map((job) => {
    const lastModified = jobLastModified(job);
    return {
      url: `${BASE_URL}/jobs/${job.id}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "daily" as const,
      priority: 0.8,
    };
  });

  // Category queries use exact taxonomy spelling. Do not normalize a stored
  // noncanonical value into a category whose canonical page would be empty.
  // Unlike the homepage shortcuts, include every populated industry, not six.
  const populatedCategories = new Set(liveJobs.map((job) => job.category));
  const categoryPages: MetadataRoute.Sitemap = INDUSTRIES
    .filter((category) => populatedCategories.has(category))
    .map((category) => ({
      url: `${BASE_URL}/jobs?category=${encodeURIComponent(category)}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));

  // Only public company profiles with an active job are indexable. Keep the
  // existing company lookup, with bounded ID batches below the API row limit.
  const hiringCompanyIds = [...new Set(liveJobs.map((job) => job.company_id))];
  const companyIds = new Set<string>();
  for (let start = 0; start < hiringCompanyIds.length; start += COMPANY_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .in("id", hiringCompanyIds.slice(start, start + COMPANY_BATCH_SIZE))
      .order("id", { ascending: true });

    if (error) throw new Error("Unable to load hiring companies for sitemap", { cause: error });
    for (const company of data ?? []) companyIds.add(company.id);
  }

  const companyPages: MetadataRoute.Sitemap = [...companyIds].map((id) => ({
    url: `${BASE_URL}/companies/${id}`,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  return [...staticPages, ...jobPages, ...categoryPages, ...companyPages];
}
