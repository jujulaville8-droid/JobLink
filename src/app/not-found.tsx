import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
      <p className="font-display text-6xl text-primary/30">404</p>
      <h1 className="mt-4 font-display text-2xl text-text sm:text-3xl">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 max-w-md text-text-light">
        The link may be broken, or the job listing it pointed to has since been
        filled or closed.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/jobs" className="btn-primary text-sm">
          Browse all jobs
        </Link>
        <Link
          href="/"
          className="inline-flex items-center rounded-xl border border-border/60 bg-white px-4 py-2 text-sm font-medium text-text-light transition-colors hover:text-primary"
        >
          Go to homepage
        </Link>
      </div>
    </div>
  );
}
