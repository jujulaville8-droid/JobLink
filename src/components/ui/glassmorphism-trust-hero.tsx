"use client";

import React from "react";
import {
  Briefcase,
  Users,
  Building2,
  TrendingUp,
  Star,
  Zap,
} from "lucide-react";
import SearchBar from "@/components/SearchBar";
import { HeroCTAs } from "@/components/HomeCTA";

const StatItem = ({ value, label }: { value: string; label: string }) => (
  <div className="flex flex-col items-center justify-center transition-transform hover:-translate-y-0.5 cursor-default">
    <span className="text-xl font-bold text-white sm:text-2xl">{value}</span>
    <span className="text-[10px] uppercase tracking-wider text-white/50 font-medium sm:text-xs">
      {label}
    </span>
  </div>
);

interface HeroProps {
  stats: { activeJobs: number; companies: number; applicants: number };
  hiringCompanies: string[];
}

export default function GlassmorphismHero({
  stats,
  hiringCompanies,
}: HeroProps) {
  return (
    <div className="relative w-full overflow-hidden font-sans">
      {/* Scoped animations */}
      <style>{`
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroMarquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .hero-fade { animation: heroFadeIn 0.7s ease-out forwards; opacity: 0; }
        .hero-marquee { animation: heroMarquee 35s linear infinite; }
        .hero-d1 { animation-delay: 0.1s; }
        .hero-d2 { animation-delay: 0.2s; }
        .hero-d3 { animation-delay: 0.3s; }
        .hero-d4 { animation-delay: 0.4s; }
        .hero-d5 { animation-delay: 0.5s; }
      `}</style>

      {/* Background */}
      <div
        className="absolute inset-0 z-0 bg-[url('/images/colorful-buildings.avif')] bg-cover bg-center"
        style={{
          maskImage:
            "linear-gradient(180deg, black 0%, black 75%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, black 0%, black 75%, transparent 100%)",
        }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0a2e2f]/85 via-[#0a2e2f]/75 to-[#0a2e2f]/95" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-20 pb-14 sm:px-6 sm:pt-28 sm:pb-20 lg:px-8 lg:pt-32 lg:pb-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12 items-start">
          {/* --- LEFT COLUMN --- */}
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6 sm:space-y-8">
            {/* Badge */}
            <div className="hero-fade hero-d1">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md">
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white/70 flex items-center gap-2">
                  Antigua &amp; Barbuda&apos;s Job Platform
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                </span>
              </div>
            </div>

            {/* Heading */}
            <h1 className="hero-fade hero-d2 font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl tracking-tight leading-[0.95]">
              <span className="text-white">Get hired</span>
              <br />
              <span className="bg-gradient-to-br from-white via-white to-[#e8973e] bg-clip-text text-transparent">
                today.
              </span>
            </h1>

            {/* Description */}
            <p className="hero-fade hero-d3 max-w-lg text-base sm:text-lg text-white/60 leading-relaxed">
              Connecting job seekers with employers across Antigua and Barbuda.
              Browse opportunities and apply in minutes.
            </p>

            {/* Search */}
            <div className="hero-fade hero-d4">
              <SearchBar />
            </div>

            {/* CTAs */}
            <div className="hero-fade hero-d4">
              <HeroCTAs />
            </div>
          </div>

          {/* --- RIGHT COLUMN --- */}
          <div className="lg:col-span-5 space-y-5 lg:mt-8">
            {/* Stats Card */}
            <div className="hero-fade hero-d5 relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
              {/* Glow */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 h-56 w-56 rounded-full bg-[#0d7377]/20 blur-3xl pointer-events-none" />

              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                      {stats.activeJobs > 0 ? `${stats.activeJobs}+` : "New"}
                    </div>
                    <div className="text-sm text-white/50">
                      Active Opportunities
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-2.5 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Platform Activity</span>
                    <span className="text-white font-medium">Growing</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[85%] rounded-full bg-gradient-to-r from-[#0d7377] to-[#14919b]" />
                  </div>
                </div>

                <div className="h-px w-full bg-white/10 mb-5" />

                {/* Mini stats */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <StatItem
                    value={stats.activeJobs > 0 ? String(stats.activeJobs) : "--"}
                    label="Jobs"
                  />
                  <StatItem
                    value={
                      stats.companies > 0 ? String(stats.companies) : "--"
                    }
                    label="Employers"
                  />
                  <StatItem value="Free" label="To Apply" />
                </div>

                {/* Tags */}
                <div className="mt-6 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium tracking-wide text-white/60">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    LIVE
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium tracking-wide text-white/60">
                    <Zap className="w-3 h-3 text-amber-400" />
                    INSTANT APPLY
                  </div>
                </div>
              </div>
            </div>

            {/* Marquee — Companies hiring */}
            {hiringCompanies.length > 0 && (
              <div className="hero-fade hero-d5 relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] py-5 sm:py-6 backdrop-blur-xl">
                <p className="mb-4 px-6 text-xs font-medium text-white/40 uppercase tracking-wider">
                  Companies Hiring Now
                </p>

                <div
                  className="relative flex overflow-hidden"
                  style={{
                    maskImage:
                      "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
                    WebkitMaskImage:
                      "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
                  }}
                >
                  <div className="hero-marquee flex gap-10 whitespace-nowrap px-4">
                    {[
                      ...hiringCompanies,
                      ...hiringCompanies,
                      ...hiringCompanies,
                    ].map((name, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 opacity-40 transition-all hover:opacity-90 cursor-default"
                      >
                        <Building2 className="h-4 w-4 text-white" />
                        <span className="text-sm font-bold text-white tracking-tight">
                          {name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
