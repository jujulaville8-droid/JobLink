import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const BASE_URL = "https://joblinkantigua.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/jobs`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/signup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
  ];

  // Dynamic job pages
  const { data: jobs } = await supabase
    .from("job_listings")
    .select("id, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const jobPages: MetadataRoute.Sitemap = (jobs || []).map((job) => ({
    url: `${BASE_URL}/jobs/${job.id}`,
    lastModified: new Date(job.created_at),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Dynamic company pages
  const { data: companies } = await supabase
    .from("companies")
    .select("id, created_at")
    .order("created_at", { ascending: false });

  const companyPages: MetadataRoute.Sitemap = (companies || []).map((company) => ({
    url: `${BASE_URL}/companies/${company.id}`,
    lastModified: new Date(company.created_at),
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));

  return [...staticPages, ...jobPages, ...companyPages];
}
