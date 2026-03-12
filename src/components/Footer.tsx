import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="relative bg-bg-dark text-white">
      {/* Gradient top border */}
      <div className="h-1 bg-gradient-to-r from-primary via-accent-warm to-coral" />

      {/* Grain texture */}
      <div className="grain-overlay" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center">
              <Image
                src="/company-logo.png"
                alt="JobLink"
                width={200}
                height={200}
                className="h-20 w-auto brightness-0 invert -my-2"
              />
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
              <li><Link href="/jobs" className="text-sm text-white/40 hover:text-accent-warm transition-colors">Browse Jobs</Link></li>
              <li><Link href="/signup" className="text-sm text-white/40 hover:text-accent-warm transition-colors">Create Account</Link></li>
              <li><Link href="/saved" className="text-sm text-white/40 hover:text-accent-warm transition-colors">Saved Jobs</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">
              Employers
            </h3>
            <ul className="space-y-2.5">
              <li><Link href="/signup" className="text-sm text-white/40 hover:text-accent-warm transition-colors">Post a Job</Link></li>
              <li><Link href="/dashboard" className="text-sm text-white/40 hover:text-accent-warm transition-colors">Dashboard</Link></li>
              <li><Link href="/about" className="text-sm text-white/40 hover:text-accent-warm transition-colors">Why JobLink</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">
              Company
            </h3>
            <ul className="space-y-2.5">
              <li><Link href="/about" className="text-sm text-white/40 hover:text-accent-warm transition-colors">About</Link></li>
              <li><Link href="/privacy" className="text-sm text-white/40 hover:text-accent-warm transition-colors">Privacy</Link></li>
              <li><Link href="/terms" className="text-sm text-white/40 hover:text-accent-warm transition-colors">Terms</Link></li>
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
