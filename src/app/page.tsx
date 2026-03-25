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
  "Transportation & Logistics": "M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 18a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18.5 18a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  "Agriculture & Fishing": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  "Real Estate & Property": "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  "Food & Beverage": "M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3",
  "Manufacturing": "M2 20a2 2 0 002 2h16a2 2 0 002-2V8l-7 5V8l-7 5V4a2 2 0 00-2-2H4a2 2 0 00-2 2v16z",
  "Telecommunications": "M22 12h-4l-3 9L9 3l-3 9H2",
  "Insurance": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  "Non-Profit & NGO": "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",
  "Arts & Entertainment": "M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z",
  "Automotive": "M16 3h-2l-2 5h7l-2-5zM5 8h14l1 7H4l1-7zM6 18a2 2 0 100-4 2 2 0 000 4zM18 18a2 2 0 100-4 2 2 0 000 4z",
  "Security & Safety": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  "Cleaning & Maintenance": "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  "Administrative & Office": "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z",
  "Marketing & Media": "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z",
  "Accounting": "M4 2v20M20 2v20M4 12h16M12 2v20",
  "Customer Service": "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
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
            <h1 className="animate-fade-up font-display text-[2.5rem] sm:text-[3.25rem] lg:text-[4rem] text-white leading-[1.05] tracking-tight">
              Find your next{" "}
              <span className="text-accent-warm">opportunity</span>
            </h1>

            <p className="animate-fade-up mt-6 text-lg sm:text-xl text-white/80 max-w-xl mx-auto leading-relaxed" style={{ animationDelay: "100ms" }}>
              Connecting job seekers with employers across Antigua and Barbuda.
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

      {/* ===== VSL ===== */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl text-text tracking-tight section-heading-accent">
                See how it works
              </h2>
              <p className="mt-6 text-text-light leading-relaxed">
                Watch how JobLinks connects job seekers and employers across Antigua &amp; Barbuda. From sign-up to application — it only takes a few minutes.
              </p>
            </div>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/15 border border-border/40">
              <video
                className="w-full h-full object-cover"
                controls
                preload="auto"
              poster=""
                playsInline
              >
                <source src="/videos/vsl.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
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
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="bg-bg py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Steps */}
            <div>
              <h2 className="font-display text-3xl sm:text-4xl text-text tracking-tight section-heading-accent">
                Get started in minutes
              </h2>
              <p className="mt-4 text-text-light max-w-md">
                Whether you&apos;re looking for work or looking to hire, we keep it simple.
              </p>

              <div className="mt-10 space-y-4">
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
                ].map((step) => (
                  <div key={step.num} className="bg-white rounded-2xl p-6 border border-border shadow-sm">
                    <span className="font-display text-4xl text-accent-warm leading-none">{step.num}</span>
                    <h3 className="font-bold text-text text-base mt-3 mb-1">{step.title}</h3>
                    <p className="text-sm text-text-light leading-relaxed">{step.desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <GetStartedCTA />
              </div>
            </div>

            {/* Image */}
            <div className="relative rounded-3xl overflow-hidden aspect-[4/3] shadow-2xl shadow-black/15 hidden lg:block">
              <Image
                src="/images/people-sitting.webp"
                alt="People at a job fair in Antigua"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">
              Real People, Real Results
            </p>
            <h2 className="font-display text-2xl sm:text-3xl text-text tracking-tight">
              What job seekers are saying
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                quote: "I was sending my CV through WhatsApp for months with no response. Signed up to JobLinks on a Monday, applied to three jobs, and had an interview by Thursday. This is what Antigua needed.",
                name: "Kendra H.",
                role: "Hospitality Worker, St. John's",
              },
              {
                quote: "The resume builder alone saved me. I never had a proper CV before. Now I have one I can actually send to employers without feeling embarrassed. And it took me like ten minutes.",
                name: "Daryl S.",
                role: "Recent Graduate, All Saints",
              },
            ].map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-border bg-white p-6 sm:p-8"
                style={{ boxShadow: "var(--shadow-xs)" }}
              >
                <svg className="h-8 w-8 text-primary/20 mb-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
                <p className="text-sm text-text leading-relaxed">
                  {t.quote}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary">
                      {t.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text">{t.name}</p>
                    <p className="text-xs text-text-muted">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
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
                desc: "Create a profile in minutes. Apply with one click. No hard-to-use systems, no unnecessary steps.",
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
