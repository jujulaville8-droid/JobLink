"use client";

import Image from "next/image";

export default function AuthLogo() {
  return (
    <a href="/" className="inline-flex items-center justify-center">
      {/* Light mode — original logo, no container needed */}
      <div className="block dark:hidden">
        <Image
          src="/company-logo.png"
          alt="JobLink — Antigua's Career Network"
          width={480}
          height={480}
          className="h-52 w-auto"
          priority
        />
      </div>

      {/* Dark mode — logo on a controlled surface */}
      <div className="hidden dark:block rounded-2xl bg-[#1a1f2e] border border-white/[0.08] shadow-lg shadow-black/20 px-8 py-5">
        <Image
          src="/company-logo.png"
          alt="JobLink — Antigua's Career Network"
          width={480}
          height={480}
          className="h-36 w-auto brightness-0 invert"
          priority
        />
      </div>
    </a>
  );
}
