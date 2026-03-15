"use client";

import AuthRedirect from "@/components/AuthRedirect";
import AuthLogo from "@/components/AuthLogo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-mesh-teal flex flex-col items-center justify-center px-4 py-12 relative">
      {/* Decorative geometric element */}
      <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 left-10 w-48 h-48 rounded-full bg-accent-warm/5 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative">
        <div className="text-center mb-6">
          <AuthLogo />
        </div>
        <AuthRedirect>{children}</AuthRedirect>
      </div>
    </div>
  )
}
