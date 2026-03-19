import Link from "next/link";
import Image from "next/image";
import SearchBar from "@/components/SearchBar";
import { HeroCTAs, GetStartedCTA, EmployerCTAs } from "@/components/HomeCTA";
import { type Job } from "@/components/JobCard";
import GatedJobGrid from "@/components/GatedJobGrid";
import { createClient } from "@/lib/supabase/server";
import { JOB_TYPE_LABELS, JobType } from "@/lib/types";

const INDUSTRY_ICONS: Record<string, string> = {
  "Tourism & Hospitality": "M3 21h18M5 21V7l8-4v18M13 21V3l6 4v14",
  "Banking & Finance": "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  "Healthcare": "M22 12h-4l-3 9L9 3l-3 9H2",
  "Education": "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  "Construction": "M2 20h20M4 20V10l8-6 8 6v10M9 20v-4h6v4",
  "Retail & Trade": "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  "Government & Civil Service": "M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3",
  "Technology": "M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0l1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16",
  "Legal": "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  "Other": "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z",
};

async function getFeaturedJobs(): Promise<Job[]> {
  try {
    const supabase = await createClient();

    const { data: jobs } = await supabase
      .from("job_listings")
      .select(
        `
        id, title, job_type, salary_min, salary_max, salary_visible,
        location, is_featured, created_at,
        company:companies ( company_name, logo_url, is_pro )
      `
      )
      .eq("status", "active")
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6);

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
    return [];
  }
}

async function getIndustryCounts(): Promise<{ name: string; icon: string; count: number }[]> {
  try {
    const supabase = await createClient();

    const { data: jobs } = await supabase
      .from("job_listings")
      .select("category")
      .eq("status", "active");

    const counts: Record<string, number> = {};
    if (jobs) {
      for (const job of jobs) {
        const cat = job.category || "Other";
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }

    return Object.entries(INDUSTRY_ICONS).map(([name, icon]) => ({
      name,
      icon,
      count: counts[name] || 0,
    }));
  } catch {
    return Object.entries(INDUSTRY_ICONS).map(([name, icon]) => ({
      name,
      icon,
      count: 0,
    }));
  }
}

async function getHiringCompanies(): Promise<string[]> {
  try {
    const supabase = await createClient();

    const { data } = await supabase
      .from("job_listings")
      .select("company:companies ( company_name )")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data) return [];

    const seen = new Set<string>();
    const names: string[] = [];
    for (const row of data) {
      const company = row.company as unknown as { company_name: string } | null;
      const name = company?.company_name;
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
        if (names.length >= 6) break;
      }
    }
    return names;
  } catch {
    return [];
  }
}

export default async function Home() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const isLoggedIn = !!user;

  const [featuredJobs, industries, hiringCompanies] = await Promise.all([
    getFeaturedJobs(),
    getIndustryCounts(),
    getHiringCompanies(),
  ]);

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden flex items-center grain-overlay">
        <div className="absolute inset-0">
          <Image
            src="/images/colorful-buildings.avif"
            alt="Colorful buildings in St. John's, Antigua"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a2e2f]/80 via-black/60 to-[#0a2e2f]/75" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 sm:px-8 pt-24 sm:pt-32 lg:pt-36 pb-16 sm:pb-20 lg:pb-24 w-full">
          <div className="text-center">
            <h1 className="animate-fade-up font-display text-[2rem] sm:text-[2.75rem] lg:text-[3.25rem] text-white leading-[1.12] tracking-tight">
              Get hired today!
            </h1>

            <p className="animate-fade-up mt-6 text-base sm:text-lg text-white/70 max-w-xl mx-auto leading-relaxed" style={{ animationDelay: "100ms" }}>
              Connecting job seekers with employers across Antigua and Barbuda.
              <br className="hidden sm:block" />
              Browse opportunities and apply in minutes.
            </p>

            <div className="animate-fade-up mt-8" style={{ animationDelay: "200ms" }}>
              <SearchBar />
            </div>

            <div className="animate-fade-up" style={{ animationDelay: "300ms" }}>
              <HeroCTAs />
            </div>
          </div>
        </div>

      </section>

      {/* ===== COMPANIES HIRING + FEATURED JOBS ===== */}
      <section className="relative bg-bg">
        {/* Overlap container — pulls up into the hero */}
        {hiringCompanies.length > 0 && (
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 -mt-6 relative z-10">
            <div className="rounded-2xl bg-white border border-border/60 shadow-lg shadow-black/[0.04] px-6 sm:px-8 py-5">
              <p className="text-center text-text-muted/60 text-[10px] font-semibold uppercase tracking-[0.25em] mb-3">
                Companies hiring now
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
                {hiringCompanies.map((name) => (
                  <span
                    key={name}
                    className="text-text/60 font-bold text-[13px] tracking-wide"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className={hiringCompanies.length > 0 ? "pt-12 sm:pt-14 pb-16 sm:pb-20" : "py-16 sm:py-20"}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">
                Open Positions
              </p>
              <h2 className="font-display text-2xl sm:text-3xl text-text tracking-tight">
                Latest Opportunities
              </h2>
              <p className="mt-1 text-sm text-text-light">
                Fresh openings from employers across the island
              </p>
            </div>
            <Link
              href="/jobs"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dark transition-colors"
            >
              View all jobs
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </div>

          <GatedJobGrid jobs={featuredJobs} isLoggedIn={isLoggedIn} />

          <div className="mt-8 text-center sm:hidden">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
            >
              View all jobs
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </div>
        </div>
        </div>
      </section>

      {/* ===== BROWSE BY INDUSTRY ===== */}
      <section className="bg-bg-alt py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">
              Industries
            </p>
            <h2 className="font-display text-2xl sm:text-3xl text-text tracking-tight">
              Browse by Industry
            </h2>
            <p className="mt-1 text-sm text-text-light">
              Explore opportunities across every sector in Antigua &amp; Barbuda
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {industries.map((ind) => (
              <Link
                key={ind.name}
                href={`/jobs?category=${encodeURIComponent(ind.name)}`}
                className="group rounded-2xl border border-border bg-bg p-5 text-center transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/[0.06] hover:-translate-y-0.5"
              >
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/8 text-primary mb-3 transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ind.icon} />
                  </svg>
                </div>
                <h3 className="font-semibold text-text text-[13px] leading-tight">{ind.name}</h3>
                <p className="text-[11px] text-text-muted mt-1">
                  {ind.count} {ind.count === 1 ? "job" : "jobs"}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="bg-bg py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Image */}
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3] shadow-xl shadow-black/10">
              <Image
                src="/images/people-sitting.webp"
                alt="People at a job fair in Antigua"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>

            {/* Steps */}
            <div>
              <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">
                How it works
              </p>
              <h2 className="font-display text-2xl sm:text-3xl text-text tracking-tight">
                Get started in minutes
              </h2>
              <p className="mt-2 text-sm text-text-light max-w-md">
                Whether you&apos;re looking for work or looking to hire, we keep it simple.
              </p>

              <div className="mt-10 space-y-0">
                {[
                  {
                    num: "01",
                    title: "Create your profile",
                    desc: "Sign up and add your skills, experience, and CV. Takes about 3 minutes.",
                  },
                  {
                    num: "02",
                    title: "Browse and apply",
                    desc: "Search by industry, location, or job type. Apply with one click using your saved profile.",
                  },
                  {
                    num: "03",
                    title: "Get hired",
                    desc: "Track applications in real time. Get notified the moment an employer responds.",
                  },
                ].map((step, i) => (
                  <div key={step.num} className="flex gap-5">
                    <div className="relative shrink-0 flex flex-col items-center">
                      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white font-mono text-xs font-bold shadow-md shadow-primary/20">
                        {step.num}
                      </span>
                      {i < 2 && (
                        <div className="w-px flex-1 min-h-[2rem] bg-border my-1" />
                      )}
                    </div>
                    <div className="pb-8">
                      <h3 className="font-semibold text-text text-[15px] mb-1">{step.title}</h3>
                      <p className="text-sm text-text-light leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <GetStartedCTA />
            </div>
          </div>
        </div>
      </section>

      {/* ===== OUR MISSION ===== */}
      <section className="bg-bg-alt py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">
              Our Mission
            </p>
            <h2 className="font-display text-2xl sm:text-3xl text-text tracking-tight">
              Built for Antigua &amp; Barbuda
            </h2>
            <p className="mt-4 text-text-light leading-relaxed max-w-2xl mx-auto">
              JobLinks exists because hiring in Antigua shouldn&apos;t depend on who you know or which Facebook group you&apos;re in. We&apos;re building the infrastructure to make the local job market transparent, accessible, and fair for everyone.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418",
                title: "Local First",
                desc: "Purpose-built for the Antiguan and Barbudan job market. Not a global platform with local listings bolted on.",
              },
              {
                icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
                title: "Equal Access",
                desc: "Every job seeker gets the same visibility. No pay-to-play for candidates — just skills, experience, and opportunity.",
              },
              {
                icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
                title: "Fast & Simple",
                desc: "Create a profile in minutes. Apply with one click. No bloated onboarding, no unnecessary steps.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-bg p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/8 text-primary mb-4">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                </div>
                <h3 className="font-semibold text-text text-[15px] mb-1.5">{item.title}</h3>
                <p className="text-sm text-text-light leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== EMPLOYER CTA ===== */}
      <section className="bg-bg py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden grain-overlay">
            <Image
              src="/images/harbor.jpg"
              alt="Antigua harbor with boats"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#062829]/95 via-[#0d7377]/90 to-[#14919b]/80" />
            <div className="relative px-8 sm:px-14 py-14 sm:py-20 max-w-xl">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-3">
                For Employers
              </p>
              <h2 className="font-display text-2xl sm:text-3xl text-white tracking-tight">
                Ready to find your
                <br />
                next great hire?
              </h2>
              <p className="mt-3 text-white/70 leading-relaxed">
                Post your listing and reach qualified candidates across Antigua and Barbuda. It only takes 5 minutes.
              </p>
              <EmployerCTAs />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
