import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#095355] text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg
                  className="h-4.5 w-4.5 text-[#f0a04b]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                </svg>
              </div>
              <span className="text-lg font-bold">JobLink</span>
            </Link>
            <p className="mt-3 text-sm text-white/50 leading-relaxed">
              Built in Antigua, for Antigua. Connecting talent with opportunity across every parish.
            </p>
          </div>

          {/* For Job Seekers */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">
              For Job Seekers
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/jobs" className="text-sm text-white/50 hover:text-white transition-colors">
                  Browse Jobs
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-sm text-white/50 hover:text-white transition-colors">
                  Create Account
                </Link>
              </li>
              <li>
                <Link href="/saved" className="text-sm text-white/50 hover:text-white transition-colors">
                  Saved Jobs
                </Link>
              </li>
            </ul>
          </div>

          {/* For Employers */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">
              For Employers
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/signup" className="text-sm text-white/50 hover:text-white transition-colors">
                  Post a Job
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-sm text-white/50 hover:text-white transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm text-white/50 hover:text-white transition-colors">
                  Why JobLink
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">
              Company
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/about" className="text-sm text-white/50 hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-sm text-white/50 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-white/50 hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-10 border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-white/40">
            &copy; {new Date().getFullYear()} JobLink. Made with pride in Antigua &amp; Barbuda.
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-[#0072c6]" />
            <span className="w-3 h-2 rounded-sm bg-black" />
            <span className="w-3 h-2 rounded-sm bg-[#f0a04b]" />
            <span className="w-3 h-2 rounded-sm bg-white" />
            <span className="w-3 h-2 rounded-sm bg-[#ce1126]" />
          </div>
        </div>
      </div>
    </footer>
  );
}
