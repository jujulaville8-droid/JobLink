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
    <div className="min-h-screen bg-bg flex flex-col items-center justify-start px-4 pt-16 pb-12 relative">
      {/* Only the signup role picker needs a wider canvas; other auth states retain their existing cap. */}
      <div className="w-full max-w-xl has-[[data-signup-step=role-selection]]:max-w-2xl relative">
        <AuthRedirect>{children}</AuthRedirect>
      </div>
    </div>
  );
}
