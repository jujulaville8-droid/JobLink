import Link from "next/link";
import Image from "next/image";
import SearchBar from "@/components/SearchBar";
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
      <section className="relative overflow-hidden min-h-[580px] sm:min-h-[640px] flex items-center">
        {/* Background image */}
        <div className="absolute inset-0">
          <Image
            src="/images/colorful-buildings.avif"
            alt="Colorful buildings in St. John's, Antigua"
            fill
            className="object-cover"
            priority
          />
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28 w-full">
          <div className="text-center">
            <p className="text-sm font-medium tracking-widest uppercase text-white/60 mb-4">
              Antigua &amp; Barbuda&apos;s Job Platform
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold text-white leading-[1.08] tracking-tight">
              Find Your Next
              <br />
              Opportunity Here
            </h1>
            <p className="mt-5 text-lg text-white/70 max-w-md mx-auto leading-relaxed">
              Your next career move starts here.
            </p>

            <div className="mt-9">
              <SearchBar />
            </div>

            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/jobs"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-white text-[#1a1a1a] font-semibold px-8 py-3.5 text-[15px] hover:bg-white/90 transition-colors shadow-lg"
              >
                Browse All Jobs
              </Link>
              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-white/30 text-white font-semibold px-8 py-3.5 text-[15px] hover:bg-white/10 transition-colors"
              >
                Post a Job — Free
              </Link>
            </div>

            <div className="mt-8 flex items-center justify-center gap-6 sm:gap-8 text-white/50 text-sm">
              <span><strong className="text-white/90 font-semibold">2,400+</strong> job seekers</span>
              <span className="w-px h-3 bg-white/20" />
              <span><strong className="text-white/90 font-semibold">180</strong> active listings</span>
              <span className="hidden sm:block w-px h-3 bg-white/20" />
              <span className="hidden sm:block"><strong className="text-white/90 font-semibold">85</strong> companies</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRUSTED BY ===== */}
      <section className="border-b border-[#e7e5e0] bg-white py-7 sm:py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {["Sandals", "APUA", "LIAT", "Jumby Bay", "ABTA", "Epicurean"].map((name) => (
              <span
                key={name}
                className="text-[#c4c0b8] font-bold text-sm tracking-wide"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURED JOBS ===== */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-tight">
              Latest Opportunities
            </h2>
            <p className="mt-1.5 text-[#71717a]">
              Fresh openings from employers across the island
            </p>
          </div>
          <Link
            href="/jobs"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-[#0d7377] hover:text-[#095355] transition-colors"
          >
            View all
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>

        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0d7377]"
          >
            View all jobs
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ===== BROWSE BY INDUSTRY ===== */}
      <section className="bg-white py-16 sm:py-20 border-y border-[#e7e5e0]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-tight">
              Browse by Industry
            </h2>
            <p className="mt-1.5 text-[#71717a]">
              Explore opportunities by sector
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {industries.map((ind) => (
              <Link
                key={ind.name}
                href={`/jobs?category=${encodeURIComponent(ind.name)}`}
                className="group rounded-2xl border border-[#e7e5e0] p-5 text-center hover:border-[#0d7377]/25 hover:shadow-sm transition-all bg-[#faf9f7]"
              >
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#0d7377]/8 text-[#0d7377] mb-3 group-hover:bg-[#0d7377] group-hover:text-white transition-all duration-200">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ind.icon} />
                  </svg>
                </div>
                <h3 className="font-semibold text-[#1a1a1a] text-[13px] leading-tight">{ind.name}</h3>
                <p className="text-xs text-[#a1a1aa] mt-1">{ind.count} jobs</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SPLIT SECTION: IMAGE + HOW IT WORKS ===== */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Image */}
            <div className="relative rounded-3xl overflow-hidden aspect-[4/3]">
              <Image
                src="/images/people-sitting.webp"
                alt="People at a job fair in Antigua"
                fill
                className="object-cover"
              />
            </div>

            {/* Steps */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-tight">
                Get started in minutes
              </h2>
              <p className="mt-2 text-[#71717a] mb-10">
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
                ].map((step) => (
                  <div key={step.num} className="flex gap-5">
                    <span className="text-[#0d7377] font-mono text-sm font-bold mt-0.5 shrink-0">
                      {step.num}
                    </span>
                    <div>
                      <h3 className="font-semibold text-[#1a1a1a] text-[15px] mb-1">{step.title}</h3>
                      <p className="text-sm text-[#71717a] leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-full bg-[#0d7377] hover:bg-[#095355] text-white font-semibold px-7 py-3 text-sm transition-colors"
                >
                  Create Free Account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-16 sm:py-20 bg-white border-y border-[#e7e5e0]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-tight">
              What people are saying
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#e7e5e0] p-7 sm:p-8 bg-[#faf9f7]">
              <p className="text-[#1a1a1a] leading-relaxed text-[15px]">
                &ldquo;I uploaded my CV on a Monday and had three interview calls by Thursday. JobLink connected me to opportunities I never would have found scrolling through Facebook groups.&rdquo;
              </p>
              <div className="flex items-center gap-3 mt-6 pt-6 border-t border-[#e7e5e0]">
                <div className="h-10 w-10 rounded-full bg-[#0d7377] flex items-center justify-center text-white font-semibold text-sm">
                  KM
                </div>
                <div>
                  <p className="font-semibold text-[#1a1a1a] text-sm">Keisha M.</p>
                  <p className="text-xs text-[#a1a1aa]">Hired as Admin Assistant, St. John&apos;s</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#e7e5e0] p-7 sm:p-8 bg-[#faf9f7]">
              <p className="text-[#1a1a1a] leading-relaxed text-[15px]">
                &ldquo;We posted a listing for a kitchen manager and had 15 qualified applicants within a week. Way better than the newspaper ads we used to run.&rdquo;
              </p>
              <div className="flex items-center gap-3 mt-6 pt-6 border-t border-[#e7e5e0]">
                <div className="h-10 w-10 rounded-full bg-[#095355] flex items-center justify-center text-white font-semibold text-sm">
                  RJ
                </div>
                <div>
                  <p className="font-semibold text-[#1a1a1a] text-sm">Richard J.</p>
                  <p className="text-xs text-[#a1a1aa]">Restaurant Owner, English Harbour</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== EMPLOYER CTA ===== */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden">
            <Image
              src="/images/harbor.jpg"
              alt="Antigua harbor with boats"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#095355]/90 via-[#0d7377]/85 to-[#0d7377]/75" />
            <div className="relative px-8 sm:px-14 py-14 sm:py-20 max-w-xl">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Ready to find your
                <br />
                next great hire?
              </h2>
              <p className="mt-3 text-white/70 leading-relaxed">
                Post your listing and reach thousands of qualified candidates across Antigua and Barbuda. It only takes 5 minutes.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-full bg-white text-[#0d7377] font-semibold px-7 py-3 text-sm hover:bg-white/90 transition-colors"
                >
                  Post a Job — Free
                </Link>
                <Link
                  href="/about"
                  className="inline-flex items-center justify-center rounded-full border border-white/30 text-white font-semibold px-7 py-3 text-sm hover:bg-white/10 transition-colors"
                >
                  Learn More
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

    </>
  );
}
