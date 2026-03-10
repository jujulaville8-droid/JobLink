import Link from "next/link";
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
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(160deg, #095355 0%, #0d7377 40%, #14919b 100%)" }}>
        {/* Wave texture */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 30 Q15 20 30 30 Q45 40 60 30' stroke='white' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")",
          backgroundSize: "60px 60px",
        }} />
        {/* Warm glow at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#f0a04b]/10 to-transparent" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-14 pb-16 sm:pt-20 sm:pb-24 lg:pt-28 lg:pb-32">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.08] tracking-tight">
              Find Your Next Opportunity
              <br />
              <span className="text-[#f0a04b]">in Antigua</span>
            </h1>
            <p className="mt-4 sm:mt-5 text-base sm:text-lg text-white/60 max-w-lg mx-auto leading-relaxed">
              The job platform built for Antiguans, by Antiguans. Search, apply, and get hired.
            </p>

            {/* Search Bar */}
            <div className="mt-8 sm:mt-10">
              <SearchBar />
            </div>

            {/* Two distinct CTAs */}
            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/jobs"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-[#e8613d] hover:bg-[#d4532f] text-white font-bold px-8 py-3.5 text-base transition-colors shadow-lg shadow-[#e8613d]/30"
              >
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Find a Job
              </Link>
              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-[#f0a04b] hover:bg-[#e0903b] text-white font-bold px-8 py-3.5 text-base transition-colors shadow-lg shadow-[#f0a04b]/30"
              >
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                </svg>
                Post a Job
              </Link>
            </div>

            {/* Social proof */}
            <div className="mt-8 flex items-center justify-center gap-6 sm:gap-8 text-white/50 text-sm">
              <span><strong className="text-white font-semibold">2,400+</strong> job seekers</span>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span><strong className="text-white font-semibold">180</strong> active listings</span>
              <span className="hidden sm:block w-1 h-1 rounded-full bg-white/30" />
              <span className="hidden sm:block"><strong className="text-white font-semibold">85</strong> companies</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRUSTED EMPLOYERS ===== */}
      <section className="border-b border-[#e8e2d9] bg-[#f5ede3] py-8 sm:py-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-semibold text-[#a09888] uppercase tracking-[0.15em] mb-6">
            Trusted by employers across Antigua &amp; Barbuda
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            {["Sandals", "APUA", "LIAT", "Jumby Bay", "ABTA", "Epicurean"].map((name) => (
              <div
                key={name}
                className="flex items-center justify-center h-11 px-6 rounded-full bg-white/80 border border-[#e8e2d9] text-[#8a7e70] font-bold text-sm tracking-wide hover:border-[#0d7377]/30 hover:text-[#0d7377] transition-colors"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURED JOBS ===== */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-14 sm:py-18">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#2c2c2c]">
              Latest Opportunities
            </h2>
            <p className="mt-1 text-[#7a7a72]">
              Fresh jobs from top Antiguan employers
            </p>
          </div>
          <Link
            href="/jobs"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-[#0d7377] hover:text-[#095355] transition-colors"
          >
            View all
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {mockJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>

        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0d7377] hover:text-[#095355]"
          >
            View all jobs
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ===== BROWSE BY INDUSTRY ===== */}
      <section className="bg-[#f5ede3] py-14 sm:py-18">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#2c2c2c]">
              Browse by Industry
            </h2>
            <p className="mt-2 text-[#7a7a72]">
              Categories that reflect the Antiguan economy
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {industries.map((ind) => (
              <Link
                key={ind.name}
                href={`/jobs?category=${encodeURIComponent(ind.name)}`}
                className="group bg-white rounded-xl border border-[#e8e2d9] p-5 text-center hover:border-[#0d7377]/30 hover:shadow-md transition-all"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#0d7377]/10 text-[#0d7377] mb-3 group-hover:bg-[#0d7377] group-hover:text-white transition-colors">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ind.icon} />
                  </svg>
                </div>
                <h3 className="font-semibold text-[#2c2c2c] text-sm leading-tight">{ind.name}</h3>
                <p className="text-xs text-[#a09888] mt-1">{ind.count} jobs</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-14 sm:py-18 bg-[#fffcf8]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#2c2c2c]">
              Real People, Real Results
            </h2>
            <p className="mt-2 text-[#7a7a72]">
              Hear from the JobLink community
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Job Seeker Testimonial */}
            <div className="bg-[#f5ede3] rounded-2xl p-7 sm:p-8 border border-[#e8e2d9]">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="h-4 w-4 text-[#f0a04b]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <p className="text-[#2c2c2c] leading-relaxed mb-5">
                &ldquo;I uploaded my CV on a Monday and had three interview calls by Thursday. JobLink connected me to opportunities I never would have found scrolling through Facebook groups.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#0d7377] flex items-center justify-center text-white font-bold text-sm">
                  KM
                </div>
                <div>
                  <p className="font-semibold text-[#2c2c2c] text-sm">Keisha M.</p>
                  <p className="text-xs text-[#7a7a72]">Hired as Admin Assistant, St. John&apos;s</p>
                </div>
              </div>
            </div>

            {/* Employer Testimonial */}
            <div className="bg-[#f5ede3] rounded-2xl p-7 sm:p-8 border border-[#e8e2d9]">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="h-4 w-4 text-[#f0a04b]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>
              <p className="text-[#2c2c2c] leading-relaxed mb-5">
                &ldquo;We posted a listing for a kitchen manager and had 15 qualified applicants within a week. Way better than the newspaper ads we used to run.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#e8613d] flex items-center justify-center text-white font-bold text-sm">
                  RJ
                </div>
                <div>
                  <p className="font-semibold text-[#2c2c2c] text-sm">Richard J.</p>
                  <p className="text-xs text-[#7a7a72]">Restaurant Owner, English Harbour</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="bg-[#f5ede3] py-14 sm:py-18">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#2c2c2c]">
              How It Works
            </h2>
            <p className="mt-2 text-[#7a7a72]">
              Three steps to your next opportunity
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                num: "1",
                title: "Create Your Profile",
                desc: "Sign up in minutes. Add your skills and upload your CV from your phone or desktop.",
                icon: (
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ),
              },
              {
                num: "2",
                title: "Browse & Apply",
                desc: "Search by parish, industry, or job type. One-click apply with your saved profile.",
                icon: (
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                ),
              },
              {
                num: "3",
                title: "Get Hired",
                desc: "Track your applications in real time. Get notified when employers want to connect.",
                icon: (
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ),
              },
            ].map((step) => (
              <div key={step.num} className="relative bg-white rounded-2xl p-7 text-center shadow-sm border border-[#e8e2d9]">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#0d7377] text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-md">
                  {step.num}
                </div>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0d7377]/10 text-[#0d7377] mb-4 mt-1">
                  {step.icon}
                </div>
                <h3 className="font-bold text-[#2c2c2c] text-lg mb-2">{step.title}</h3>
                <p className="text-[#7a7a72] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== EMPLOYER CTA ===== */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-14 sm:py-18">
        <div className="rounded-3xl overflow-hidden relative" style={{ background: "linear-gradient(135deg, #095355 0%, #0d7377 50%, #14919b 100%)" }}>
          <div className="absolute inset-0 opacity-[0.06]" style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 30 Q15 20 30 30 Q45 40 60 30' stroke='white' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")",
            backgroundSize: "60px 60px",
          }} />
          <div className="relative px-8 sm:px-14 py-12 sm:py-16 text-center">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Ready to Find Your Next Hire?
            </h2>
            <p className="mt-3 text-white/60 max-w-lg mx-auto leading-relaxed">
              Post your listing and reach thousands of qualified candidates across Antigua and Barbuda. It only takes 5 minutes.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-[#e8613d] hover:bg-[#d4532f] text-white font-bold px-8 py-3.5 transition-colors shadow-lg shadow-[#e8613d]/30"
              >
                Post a Job — It&apos;s Free
              </Link>
              <Link
                href="/about"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border-2 border-white/20 hover:border-white/40 hover:bg-white/5 text-white font-bold px-8 py-3.5 transition-all"
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== LOCATION CALLOUT ===== */}
      <section className="border-t border-[#e8e2d9] bg-[#f5ede3] py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#2c2c2c] mb-6">
            Jobs Across Every Parish
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {["St. John's", "All Saints", "St. George", "St. Peter", "St. Philip", "St. Paul", "St. Mary", "English Harbour", "Barbuda"].map((parish) => (
              <Link
                key={parish}
                href={`/jobs?location=${encodeURIComponent(parish)}`}
                className="px-4 py-2 rounded-full bg-white border border-[#e8e2d9] text-sm font-medium text-[#7a7a72] hover:border-[#0d7377]/40 hover:text-[#0d7377] transition-colors"
              >
                {parish}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
