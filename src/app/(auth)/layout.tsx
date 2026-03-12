"use client";

import Image from "next/image";
import AuthRedirect from "@/components/AuthRedirect";

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
        <div className="text-center mb-8">
          <a href="/" className="inline-block">
            <Image
              src="/company-logo.png"
              alt="JobLink — Antigua's Career Network"
              width={240}
              height={240}
              className="h-24 w-auto"
            />
          </a>
        </div>
        <AuthRedirect>{children}</AuthRedirect>
      </div>
    </div>
  )
}
