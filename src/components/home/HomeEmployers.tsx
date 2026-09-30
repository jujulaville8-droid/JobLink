"use client"

import Image from "next/image"
import Link from "next/link"
import { BadgeCheck, BriefcaseBusiness, Building2, FileCheck, Megaphone, Users } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { employerEntry } from "@/lib/employer-entry"
import { BentoCard, BentoGrid } from "@/components/magicui/bento-grid"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { OrbitingCircles } from "@/components/magicui/orbiting-circles"
import type { HomepageStats } from "./HomePage"

export default function HomeEmployers({ stats }: { stats: HomepageStats }) {
  const { isAuthenticated, userRole } = useAuth()
  const action = employerEntry(isAuthenticated, userRole)
  return (
      <section className="home-employers" id="employers" aria-labelledby="employers-title">
        <h2 id="employers-title" className="sr-only">
          Build your team with JobLink.
        </h2>
        <BentoGrid className="home-employer-grid">
          <BentoCard
            name="Build your team with JobLink."
            description="Create your employer account, add your company profile and post your vacancy. Manage jobs and applications in one place."
            Icon={Building2}
            href={action.href}
            cta={action.label}
            background={
              <div className="home-bento-photo">
                <Image
                  src="/images/people-sitting.webp"
                  alt="A job seeker speaking with recruiters at a job fair"
                  fill
                  sizes="(max-width: 700px) 100vw, 66vw"
                />
              </div>
            }
            className="md:col-span-2"
          />
          <BentoCard
            name="Applications delivered"
            description="A real-time view of activity across JobLink."
            Icon={FileCheck}
            href={action.href}
            cta={action.label}
            background={
              <div className="home-bento-stat-bg">
                <NumberTicker
                  value={stats.applications}
                  data-reduced-value={stats.applications}
                  aria-label={`${stats.applications} applications delivered`}
                  className="text-6xl font-bold tabular-nums text-[#102040]"
                />
              </div>
            }
            className="md:col-span-1"
          />
          <BentoCard
            name="A connected hiring loop"
            description="Post vacancies, review applications and connect with candidates from your employer workspace."
            Icon={Users}
            href={action.href}
            cta={action.label}
            background={
              <div className="home-orbit-visual">
                <Image
                  src="/logo-icon.png"
                  alt="JobLink"
                  width={56}
                  height={56}
                  className="rounded-full"
                />
                <OrbitingCircles iconSize={36} radius={90} duration={22}>
                  <BriefcaseBusiness className="text-[#104080]" />
                  <Building2 className="text-[#104080]" />
                  <Megaphone className="text-[#209080]" />
                </OrbitingCircles>
                <OrbitingCircles iconSize={28} radius={150} duration={30} reverse>
                  <Users className="text-[#209080]" />
                  <FileCheck className="text-[#104080]" />
                  <BadgeCheck className="text-[#209080]" />
                </OrbitingCircles>
              </div>
            }
            className="md:col-span-1"
          />
          <div className="home-employer-steps col-span-3 md:col-span-2">
            <div>
              <p className="home-eyebrow">For employers</p>
              <ol>
                <li>Create your employer account</li>
                <li>Add your company and vacancy</li>
                <li>Meet suitable applicants</li>
              </ol>
            </div>
            <div className="home-employer-actions">
              <Link
                href={action.href}
                className="inline-flex items-center justify-center text-center rounded-lg bg-[#104080] px-8 py-3 text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#104080]"
              >
                {action.label}
              </Link>
              <p className="mt-4 text-sm">Prefer a hand getting started? <Link href="/employers/hiring-help" className="underline underline-offset-4">Get hiring help</Link></p>
            </div>
          </div>
        </BentoGrid>
      </section>

  )
}
