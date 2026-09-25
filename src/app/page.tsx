import HomePage, { type HomepageStats } from "@/components/home/HomePage";
import { type Job } from "@/components/JobCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeJsonLd } from "@/lib/safe-sql";
import { JOB_TYPE_LABELS, JobType } from "@/lib/types";

/**
 * The homepage shows three featured jobs and four counters -- all public data,
 * identical for every visitor, with the auth-dependent chrome rendered
 * client-side. force-dynamic ran five Supabase queries on every single visit
 * with no caching; a short revalidate window collapses that to one render per
 * minute while keeping listings fresh.
 */
export const revalidate = 60;

async function getFeaturedJobs(): Promise<Job[]> {
  try {
    // The admin client, like getHomepageStats below: the cookie-bound client
    // reads cookies, which opts the whole route out of static rendering and
    // makes the revalidate window above do nothing. The query is restricted to
    // active, unexpired listings, which is what the public RLS policy allows
    // anyway.
    const supabase = createAdminClient();
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
  } catch (err) {
    // Degrade to an empty featured row rather than throwing, matching
    // getHomepageStats below. Throwing here took the whole marketing page down
    // on a transient database error, and under ISR it also failed the build
    // outright if Supabase was unreachable while prerendering.
    console.error("[homepage] Could not load featured jobs:", err);
    return [];
  }
}

async function getHomepageStats(): Promise<HomepageStats> {
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const [jobsResult, hiringResult, membersResult, applicationsResult] =
      await Promise.all([
        supabase
          .from("job_listings")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .or(`expires_at.is.null,expires_at.gt.${now}`),
        supabase
          .from("companies")
          .select("id, job_listings!inner(id)", { count: "exact", head: true })
          .eq("job_listings.status", "active")
          .or(`expires_at.is.null,expires_at.gt.${now}`, {
            referencedTable: "job_listings",
          }),
        supabase
          .from("users")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("applications")
          .select("id", { count: "exact", head: true }),
      ]);

    const firstError = [
      jobsResult.error,
      hiringResult.error,
      membersResult.error,
      applicationsResult.error,
    ].find(Boolean);

    if (firstError) throw firstError;

    return {
      jobs: jobsResult.count ?? 0,
      employers: hiringResult.count ?? 0,
      members: membersResult.count ?? 0,
      applications: applicationsResult.count ?? 0,
    };
  } catch {
    return { jobs: 0, employers: 0, members: 0, applications: 0 };
  }
}


export default async function Home() {
  const [jobs, stats] = await Promise.all([
    getFeaturedJobs(),
    getHomepageStats(),
  ]);
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
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }} />
    <HomePage jobs={jobs} stats={stats} />
  </>;
}
