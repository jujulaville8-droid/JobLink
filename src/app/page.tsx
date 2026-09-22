import HomePage from "@/components/home/HomePage";
import { type Job } from "@/components/JobCard";
import { createClient } from "@/lib/supabase/server";
import { JOB_TYPE_LABELS, JobType } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getFeaturedJobs(): Promise<Job[]> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data: jobs, error } = await supabase
      .from("job_listings")
      .select(
        `
        id, title, job_type, salary_min, salary_max, salary_visible,
        location, is_featured, created_at,
        company:companies ( company_name, logo_url, is_pro )
      `
      )
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) throw error;
    if (!jobs || jobs.length === 0) return [];

    return jobs.map((job) => {
      const company = job.company as unknown as {
        company_name: string;
        logo_url: string | null;
        is_pro: boolean;
      } | null;

      return {
        id: job.id,
        title: job.title,
        company_name: company?.company_name || "Company",
        company_logo: company?.logo_url || null,
        location: job.location,
        job_type: JOB_TYPE_LABELS[job.job_type as JobType] || job.job_type,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        salary_visible: job.salary_visible,
        created_at: job.created_at,
        is_featured: job.is_featured,
        is_pro_company: company?.is_pro ?? false,
      };
    });
  } catch {
    throw new Error("Job listings temporarily unavailable");
  }
}


export default async function Home() {
  const jobs = await getFeaturedJobs();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization", name: "JobLinks", url: "https://joblinkantigua.com",
        logo: "https://joblinkantigua.com/favicon.png",
        description: "Connecting job seekers with employers across Antigua and Barbuda.",
        areaServed: { "@type": "Country", name: "Antigua and Barbuda" },
        contactPoint: { "@type": "ContactPoint", email: "hello@joblinkantigua.com", contactType: "customer service" },
      },
      {
        "@type": "WebSite", name: "JobLinks", url: "https://joblinkantigua.com",
        potentialAction: { "@type": "SearchAction", target: "https://joblinkantigua.com/jobs?q={search_term_string}", "query-input": "required name=search_term_string" },
      },
      {
        "@type": "EmploymentAgency", name: "JobLinks", url: "https://joblinkantigua.com",
        email: "hello@joblinkantigua.com",
        areaServed: { "@type": "Country", name: "Antigua and Barbuda" },
        address: { "@type": "PostalAddress", addressLocality: "St. John's", addressCountry: "AG" },
      },
    ],
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <HomePage jobs={jobs} />
  </>;
}
