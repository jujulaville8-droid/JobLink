import type { Metadata } from "next";
import AuthRedirect from "@/components/AuthRedirect";

/**
 * Auth screens are noindex by default.
 *
 * They were previously indexable and, because none of them set their own
 * canonical, they inherited the root layout's `canonical: joblinkantigua.com`
 * — telling Google that /login, /forgot-password and /reset-password were all
 * duplicates of the homepage.
 *
 * The two signup pages are genuine acquisition entry points and opt back in
 * via their own layouts.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-mesh-teal flex flex-col items-center justify-start px-4 pt-16 pb-12 relative">
      {/* Decorative geometric element */}
      <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 left-10 w-48 h-48 rounded-full bg-accent-warm/5 blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl relative">
        <AuthRedirect>{children}</AuthRedirect>
      </div>
    </div>
  );
}
