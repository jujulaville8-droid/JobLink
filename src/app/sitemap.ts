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
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  // No lastModified until an authoritative content-modification date exists.
  // A request timestamp or a record's creation date is not that date.
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/jobs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/employers/hiring-help`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/employers/upgrade`, changeFrequency: "monthly", priority: 0.4 },
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
      .select("id, company_id, category")
      .eq("status", "active")
      .order("id", { ascending: true })
      .range(start, start + JOB_PAGE_SIZE - 1);

    // A database outage must not publish a successful but incomplete sitemap.
    if (error) throw new Error("Unable to load live jobs for sitemap", { cause: error });
    for (const job of data ?? []) jobs.set(job.id, job);
    if (!data || data.length < JOB_PAGE_SIZE) break;
  }
  const liveJobs = [...jobs.values()];

  const jobPages: MetadataRoute.Sitemap = liveJobs.map((job) => ({
    url: `${BASE_URL}/jobs/${job.id}`,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

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
