import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo-white.svg" alt="JobLink" width={28} height={28} className="h-7 w-7" />
              <span className="text-base font-bold">JobLink</span>
            </Link>
            <p className="mt-3 text-sm text-white/40 leading-relaxed max-w-[220px]">
              Connecting talent with opportunity across Antigua &amp; Barbuda.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">
              Job Seekers
            </h3>
            <ul className="space-y-2.5">
              <li><Link href="/jobs" className="text-sm text-white/40 hover:text-white transition-colors">Browse Jobs</Link></li>
              <li><Link href="/signup" className="text-sm text-white/40 hover:text-white transition-colors">Create Account</Link></li>
              <li><Link href="/saved" className="text-sm text-white/40 hover:text-white transition-colors">Saved Jobs</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">
              Employers
            </h3>
            <ul className="space-y-2.5">
              <li><Link href="/signup" className="text-sm text-white/40 hover:text-white transition-colors">Post a Job</Link></li>
              <li><Link href="/dashboard" className="text-sm text-white/40 hover:text-white transition-colors">Dashboard</Link></li>
              <li><Link href="/about" className="text-sm text-white/40 hover:text-white transition-colors">Why JobLink</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">
              Company
            </h3>
            <ul className="space-y-2.5">
              <li><Link href="/about" className="text-sm text-white/40 hover:text-white transition-colors">About</Link></li>
              <li><Link href="/privacy" className="text-sm text-white/40 hover:text-white transition-colors">Privacy</Link></li>
              <li><Link href="/terms" className="text-sm text-white/40 hover:text-white transition-colors">Terms</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} JobLink. Made in Antigua &amp; Barbuda.
          </p>
        </div>
      </div>
    </footer>
  );
}
