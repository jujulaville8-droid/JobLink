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

export default function Home() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2a4f7f 50%, #1e3a5f 100%)" }}>
        <div className="absolute inset-0">
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }} />
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white/10 to-transparent" />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28 lg:pt-32 lg:pb-36">
          <div className="text-center">
            <p className="text-sm sm:text-base font-medium text-[#e85d26] tracking-wide uppercase mb-3">
              Made in Antigua, for Antigua
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
              Find Your Next
              <br />
              <span className="text-[#e85d26]">Opportunity</span>
            </h1>
            <p className="mt-5 sm:mt-6 text-base sm:text-lg text-white/70 max-w-xl mx-auto leading-relaxed">
              The first dedicated job platform for Antigua and Barbuda. Browse jobs, connect with employers, and build your career.
            </p>

            <div className="mt-8 sm:mt-10">
              <SearchBar />
            </div>

            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/jobs"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-[#e85d26] hover:bg-[#d14e1a] text-white font-bold px-8 py-3.5 transition-colors shadow-lg shadow-[#e85d26]/25"
              >
                Find a Job
              </Link>
              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border-2 border-white/25 hover:border-white/50 hover:bg-white/5 text-white font-bold px-8 py-3.5 transition-all"
              >
                Post a Job
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative -mt-8 z-10 px-4 sm:px-6 lg:px-8 mb-12">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl shadow-black/5 border border-gray-100 px-6 py-6 sm:px-10 sm:py-7">
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            {[
              { value: "2,400+", label: "Job Seekers" },
              { value: "180", label: "Active Listings" },
              { value: "85", label: "Companies" },
            ].map((stat) => (
              <div key={stat.label} className="text-center px-2">
                <p className="text-2xl sm:text-3xl font-extrabold text-[#1e3a5f]">{stat.value}</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Jobs */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
              Featured Jobs
            </h2>
            <p className="mt-1 text-gray-500">
              Latest opportunities from top employers
            </p>
          </div>
          <Link
            href="/jobs"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-[#e85d26] hover:text-[#d14e1a] transition-colors"
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
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#e85d26] hover:text-[#d14e1a]"
          >
            View all jobs
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
              How It Works
            </h2>
            <p className="mt-2 text-gray-500">
              Get started in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                num: "1",
                title: "Create Your Profile",
                desc: "Sign up in minutes. Add your skills, experience, and upload your CV.",
                icon: (
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ),
              },
              {
                num: "2",
                title: "Browse Jobs",
                desc: "Search and filter by location, industry, and job type across Antigua.",
                icon: (
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                ),
              },
              {
                num: "3",
                title: "Apply & Get Hired",
                desc: "One-click apply with your saved profile. Track your applications in real time.",
                icon: (
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ),
              },
            ].map((step) => (
              <div key={step.num} className="relative bg-white rounded-2xl p-7 text-center shadow-sm border border-gray-100">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#e85d26] text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-md">
                  {step.num}
                </div>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1e3a5f]/10 text-[#1e3a5f] mb-4 mt-1">
                  {step.icon}
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Employer CTA */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="rounded-3xl overflow-hidden relative" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #2a4f7f 100%)" }}>
          <div className="absolute inset-0 opacity-[0.05]" style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }} />
          <div className="relative px-8 sm:px-14 py-12 sm:py-16 text-center">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Ready to Find Your Next Hire?
            </h2>
            <p className="mt-3 text-white/70 max-w-lg mx-auto leading-relaxed">
              Post your job listing and reach thousands of qualified candidates across Antigua and Barbuda.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-[#e85d26] hover:bg-[#d14e1a] text-white font-bold px-8 py-3.5 transition-colors shadow-lg shadow-[#e85d26]/25"
              >
                Post a Job — It&apos;s Free
              </Link>
              <Link
                href="/about"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border-2 border-white/25 hover:border-white/50 hover:bg-white/5 text-white font-bold px-8 py-3.5 transition-all"
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="border-t border-gray-100 py-12 sm:py-16 bg-gray-50/50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-[0.15em] mb-8">
            Trusted by leading employers in Antigua &amp; Barbuda
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            {["Sandals", "APUA", "LIAT", "Jumby Bay", "ABTA", "Epicurean"].map((name) => (
              <div
                key={name}
                className="flex items-center justify-center h-11 px-5 rounded-lg bg-white border border-gray-200 text-gray-400 font-bold text-sm tracking-wide"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
