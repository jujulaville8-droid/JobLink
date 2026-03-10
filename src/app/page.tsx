import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import SearchBar from "@/components/SearchBar";
import StatsBar from "@/components/StatsBar";
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
    created_at: "2025-12-01T00:00:00Z",
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
    created_at: "2025-11-28T00:00:00Z",
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
    created_at: "2025-12-02T00:00:00Z",
    is_featured: false,
  },
];

const steps = [
  {
    title: "Create Your Profile",
    description:
      "Sign up in minutes. Add your skills, experience, and what you're looking for.",
    icon: (
      <svg
        className="h-8 w-8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
        <line x1="12" y1="11" x2="12" y2="14" />
        <line x1="10.5" y1="12.5" x2="13.5" y2="12.5" />
      </svg>
    ),
  },
  {
    title: "Browse Jobs",
    description:
      "Search and filter opportunities by location, industry, and job type across Antigua and Barbuda.",
    icon: (
      <svg
        className="h-8 w-8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    title: "Apply & Connect",
    description:
      "Apply directly or share your interest via WhatsApp. Get hired by top local employers.",
    icon: (
      <svg
        className="h-8 w-8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      {/* Hero Section */}
      <section className="relative bg-primary overflow-hidden">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.15) 1px, transparent 1px), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight tracking-tight">
              Find Your Next Opportunity
              <br />
              <span className="text-accent">in Antigua</span>
            </h1>
            <p className="mt-4 sm:mt-6 text-base sm:text-lg text-white/80 max-w-2xl mx-auto">
              The first dedicated job platform built for Antigua and Barbuda.
              Connect with top employers and discover local career opportunities.
            </p>

            {/* Search bar */}
            <div className="mt-8 sm:mt-10">
              <SearchBar />
            </div>

            {/* CTA buttons */}
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/jobs"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold px-8 py-3 transition-colors text-sm sm:text-base"
              >
                Find a Job
              </Link>
              <Link
                href="/post-job"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border-2 border-white/30 hover:border-white/60 text-white font-semibold px-8 py-3 transition-colors text-sm sm:text-base"
              >
                Post a Job
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative -mt-6 z-10 px-4 sm:px-6 lg:px-8 mb-8">
        <StatsBar />
      </section>

      {/* Featured Jobs */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-text">
              Featured Jobs
            </h2>
            <p className="mt-1 text-text-light text-sm sm:text-base">
              Latest opportunities from top employers
            </p>
          </div>
          <Link
            href="/jobs"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-light transition-colors"
          >
            View all jobs
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-light transition-colors"
          >
            View all jobs
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-text">
              How It Works
            </h2>
            <p className="mt-2 text-text-light text-sm sm:text-base">
              Get started in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="relative bg-white rounded-xl p-6 sm:p-8 text-center border border-border"
              >
                {/* Step number */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                  {i + 1}
                </div>

                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-4">
                  {step.icon}
                </div>
                <h3 className="font-semibold text-text text-lg mb-2">
                  {step.title}
                </h3>
                <p className="text-text-light text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Employer CTA */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="bg-primary rounded-2xl px-6 sm:px-12 py-10 sm:py-14 text-center relative overflow-hidden">
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
          </div>

          <div className="relative">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Ready to Find Your Next Hire?
            </h2>
            <p className="mt-3 text-white/80 text-sm sm:text-base max-w-xl mx-auto">
              Post your job listing and reach thousands of qualified candidates
              across Antigua and Barbuda. Simple, fast, and effective.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/post-job"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold px-8 py-3 transition-colors"
              >
                Post a Job Now
              </Link>
              <Link
                href="/employers"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border-2 border-white/30 hover:border-white/60 text-white font-semibold px-8 py-3 transition-colors"
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Signals / Logos */}
      <section className="border-t border-border py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-text-light font-medium uppercase tracking-wider mb-8">
            Trusted by leading employers in Antigua &amp; Barbuda
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            {[
              "Sandals",
              "APUA",
              "LIAT",
              "Jumby Bay",
              "ABTA",
              "Epicurean",
            ].map((name) => (
              <div
                key={name}
                className="flex items-center justify-center h-10 px-4 rounded-lg bg-gray-100 text-text-light font-semibold text-sm"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer spacer for mobile bottom nav */}
      <div className="h-20 md:hidden" />

      <BottomNav />
    </div>
  );
}
