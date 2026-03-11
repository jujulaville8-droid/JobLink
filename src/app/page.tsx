import Link from "next/link";
import Image from "next/image";
import SearchBar from "@/components/SearchBar";
import { HeroCTAs, GetStartedCTA, EmployerCTAs } from "@/components/HomeCTA";
import JobCard, { type Job } from "@/components/JobCard";

const mockJobs: Job[] = [
  {
    id: "1",
    title: "Front Desk Receptionist",
    company_name: "Sandals Grande Antigua",
    company_logo: null,
    location: "St. John's",
    job_type: "Full-Time",
    salary_min: 2500,
    salary_max: 3200,
    salary_visible: true,
    created_at: new Date().toISOString(),
    is_featured: true,
  },
  {
    id: "2",
    title: "Accounts Payable Clerk",
    company_name: "APUA",
    company_logo: null,
    location: "St. John's",
    job_type: "Full-Time",
    salary_min: 3000,
    salary_max: 4000,
    salary_visible: true,
    created_at: new Date().toISOString(),
    is_featured: false,
  },
  {
    id: "3",
    title: "Marketing Coordinator",
    company_name: "Antigua Barbuda Tourism Authority",
    company_logo: null,
    location: "St. George",
    job_type: "Contract",
    salary_min: 3500,
    salary_max: 5000,
    salary_visible: true,
    created_at: new Date().toISOString(),
    is_featured: true,
  },
  {
    id: "4",
    title: "Chef de Partie",
    company_name: "Jumby Bay Island",
    company_logo: null,
    location: "St. Peter",
    job_type: "Full-Time",
    salary_min: 2800,
    salary_max: 3800,
    salary_visible: true,
    created_at: new Date().toISOString(),
    is_featured: false,
  },
  {
    id: "5",
    title: "IT Support Technician",
    company_name: "LIAT 2020",
    company_logo: null,
    location: "St. John's",
    job_type: "Full-Time",
    salary_min: 3200,
    salary_max: 4500,
    salary_visible: true,
    created_at: new Date().toISOString(),
    is_featured: false,
  },
  {
    id: "6",
    title: "Retail Sales Associate",
    company_name: "Epicurean Fine Foods",
    company_logo: null,
    location: "All Saints",
    job_type: "Part-Time",
    salary_min: 1500,
    salary_max: 2000,
    salary_visible: true,
    created_at: new Date().toISOString(),
    is_featured: false,
  },
];

const industries = [
  { name: "Tourism & Hospitality", icon: "M3 21h18M5 21V7l8-4v18M13 21V3l6 4v14", count: 48 },
  { name: "Finance & Banking", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", count: 22 },
  { name: "Healthcare", icon: "M22 12h-4l-3 9L9 3l-3 9H2", count: 18 },
  { name: "Education", icon: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z", count: 15 },
  { name: "Construction", icon: "M2 20h20M4 20V10l8-6 8 6v10M9 20v-4h6v4", count: 24 },
  { name: "Retail & Trade", icon: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0", count: 31 },
  { name: "Government", icon: "M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3", count: 12 },
  { name: "Technology", icon: "M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0l1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16", count: 9 },
];

export default function Home() {
  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden flex items-center grain-overlay">
        {/* Background image */}
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

        <div className="relative mx-auto max-w-3xl px-6 sm:px-8 py-24 sm:py-32 lg:py-36 w-full">
          <div className="text-center">
            <h1 className="animate-fade-up font-display text-[2rem] sm:text-[2.75rem] lg:text-[3.25rem] text-white leading-[1.12] tracking-tight">
              Find Opportunities.
              <br />
              Connect With Employers.
              <br />
              Get Hired.
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

            <div className="animate-fade-up mt-10 flex items-center justify-center gap-6 sm:gap-8 text-white/50 text-sm" style={{ animationDelay: "400ms" }}>
              <span><strong className="text-white/85 font-semibold">2,400+</strong> job seekers</span>
              <span className="w-px h-3 bg-white/20" />
              <span><strong className="text-white/85 font-semibold">180</strong> active listings</span>
              <span className="hidden sm:block w-px h-3 bg-white/20" />
              <span className="hidden sm:block"><strong className="text-white/85 font-semibold">85</strong> companies</span>
            </div>
          </div>
        </div>

      </section>

      {/* ===== TRUSTED BY — sits flush between hero and featured ===== */}
      <div className="relative bg-bg-alt">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {["Sandals", "APUA", "LIAT", "Jumby Bay", "ABTA", "Epicurean"].map((name) => (
              <span
                key={name}
                className="text-text-muted/60 font-bold text-xs uppercase tracking-[0.15em]"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ===== FEATURED JOBS ===== */}
      <section className="bg-bg-alt py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl text-text tracking-tight">
              Latest Opportunities
            </h2>
            <p className="mt-1.5 text-text-light">
              Fresh openings from employers across the island
            </p>
          </div>
          <Link
            href="/jobs"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-dark transition-colors link-animated"
          >
            View all
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
          {mockJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>

        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary link-animated"
          >
            View all jobs
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
        </div>
      </section>

      {/* ===== BROWSE BY INDUSTRY ===== */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl sm:text-3xl text-text tracking-tight">
              Browse by Industry
            </h2>
            <p className="mt-1.5 text-text-light">
              Explore opportunities by sector
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
            {industries.map((ind) => (
              <Link
                key={ind.name}
                href={`/jobs?category=${encodeURIComponent(ind.name)}`}
                className="group rounded-[--radius-card] border border-border p-5 text-center hover:border-primary/25 hover:shadow-md hover:shadow-primary/[0.04] transition-all bg-bg hover-lift"
              >
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/8 text-primary mb-3 group-hover:bg-accent-warm group-hover:text-white transition-all duration-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ind.icon} />
                  </svg>
                </div>
                <h3 className="font-semibold text-text text-[13px] leading-tight">{ind.name}</h3>
                <p className="text-xs text-text-muted mt-1">{ind.count} jobs</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SPLIT SECTION: IMAGE + HOW IT WORKS ===== */}
      <section className="bg-bg-alt py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Image */}
            <div className="relative rounded-[--radius-card] overflow-hidden aspect-[4/3]">
              <Image
                src="/images/people-sitting.webp"
                alt="People at a job fair in Antigua"
                fill
                className="object-cover"
              />
            </div>

            {/* Steps */}
            <div>
              <h2 className="font-display text-2xl sm:text-3xl text-text tracking-tight">
                Get started in minutes
              </h2>
              <p className="mt-2 text-text-light mb-10">
                Whether you&apos;re looking for work or looking to hire, we keep it simple.
              </p>

              <div className="space-y-8">
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
                    <div className="relative shrink-0">
                      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-mono text-xs font-bold">
                        {step.num}
                      </span>
                      {i < 2 && (
                        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-px h-8 bg-border" />
                      )}
                    </div>
                    <div>
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

      {/* ===== TESTIMONIALS ===== */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-display text-2xl sm:text-3xl text-text tracking-tight">
              What people are saying
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="rounded-[--radius-card] border border-border p-7 sm:p-8 bg-bg hover-lift transition-all">
              <div className="text-accent-warm/30 text-4xl font-display leading-none mb-2">&ldquo;</div>
              <p className="text-text leading-relaxed text-[15px]">
                I uploaded my CV on a Monday and had three interview calls by Thursday. JobLink connected me to opportunities I never would have found scrolling through Facebook groups.
              </p>
              <div className="flex items-center gap-3 mt-6 pt-6 border-t border-border">
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-sm">
                  KM
                </div>
                <div>
                  <p className="font-semibold text-text text-sm">Keisha M.</p>
                  <p className="text-xs text-text-muted">Hired as Admin Assistant, St. John&apos;s</p>
                </div>
              </div>
            </div>

            <div className="rounded-[--radius-card] border border-border p-7 sm:p-8 bg-bg hover-lift transition-all">
              <div className="text-accent-warm/30 text-4xl font-display leading-none mb-2">&ldquo;</div>
              <p className="text-text leading-relaxed text-[15px]">
                We posted a listing for a kitchen manager and had 15 qualified applicants within a week. Way better than the newspaper ads we used to run.
              </p>
              <div className="flex items-center gap-3 mt-6 pt-6 border-t border-border">
                <div className="h-10 w-10 rounded-full bg-primary-dark flex items-center justify-center text-white font-semibold text-sm">
                  RJ
                </div>
                <div>
                  <p className="font-semibold text-text text-sm">Richard J.</p>
                  <p className="text-xs text-text-muted">Restaurant Owner, English Harbour</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== EMPLOYER CTA ===== */}
      <section className="bg-bg-alt py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden grain-overlay">
            <Image
              src="/images/harbor.jpg"
              alt="Antigua harbor with boats"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-bg-dark/90 via-primary-dark/85 to-primary/75" />
            <div className="relative px-8 sm:px-14 py-14 sm:py-20 max-w-xl">
              <h2 className="font-display text-2xl sm:text-3xl text-white tracking-tight">
                Ready to find your
                <br />
                next great hire?
              </h2>
              <p className="mt-3 text-white/70 leading-relaxed">
                Post your listing and reach thousands of qualified candidates across Antigua and Barbuda. It only takes 5 minutes.
              </p>
              <EmployerCTAs />
            </div>
          </div>
        </div>
      </section>

    </>
  );
}
