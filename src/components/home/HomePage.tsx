import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  FileCheck,
  MapPin,
  Megaphone,
  Search,
  Sprout,
  Users,
} from "lucide-react"

import type { Job } from "@/components/JobCard"
import { AnimatedList } from "@/components/magicui/animated-list"
import { AvatarCircles } from "@/components/magicui/avatar-circles"
import { BentoCard, BentoGrid } from "@/components/magicui/bento-grid"
import { BlurFade } from "@/components/magicui/blur-fade"
import { DotPattern } from "@/components/magicui/dot-pattern"
import { MagicCard } from "@/components/magicui/magic-card"
import { Marquee } from "@/components/magicui/marquee"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { OrbitingCircles } from "@/components/magicui/orbiting-circles"
import { ShineBorder } from "@/components/magicui/shine-border"
import { TypingAnimation } from "@/components/magicui/typing-animation"
import { WordRotate } from "@/components/magicui/word-rotate"

export interface HomepageStats {
  jobs: number
  employers: number
  members: number
  applications: number
}

interface HomePageProps {
  jobs: Job[]
  preview?: boolean
  stats?: HomepageStats
}

const avatarUrls = ["JL", "MK", "AS", "TW"].map((initials) => ({
  imageUrl: `https://ui-avatars.com/api/?name=${initials}&background=104080&color=fff`,
  profileUrl: "#",
}))

const categories = [
  "Hospitality",
  "Food Service",
  "Skilled Trades",
  "Retail",
  "Healthcare",
  "Tourism",
  "Admin",
  "Transportation",
  "Construction",
  "Customer Service",
]

// TODO(owner): replace these placeholder testimonials with real ones
const testimonials = [
  {
    quote:
      "We posted on Monday and had strong local applicants before the end of the week.",
    name: "Sample testimonial",
    role: "Hotel manager in English Harbour",
  },
  {
    quote:
      "My profile made it easier to show my experience and apply with confidence.",
    name: "Sample testimonial",
    role: "Recent hire in St. John's",
  },
  {
    quote:
      "Finding people who already understand the local market made hiring feel more personal.",
    name: "Sample testimonial",
    role: "Retail owner in All Saints",
  },
  {
    quote:
      "I could see new opportunities in one place and focus on the roles that suited me.",
    name: "Sample testimonial",
    role: "Job seeker in Liberta",
  },
  {
    quote:
      "The application process felt clear, welcoming and built for people here at home.",
    name: "Sample testimonial",
    role: "Hospitality applicant in Jolly Harbour",
  },
  {
    quote:
      "It gave our small team a simple way to reach motivated candidates across the island.",
    name: "Sample testimonial",
    role: "Restaurant manager in St. John's",
  },
]

const emptyStats: HomepageStats = {
  jobs: 0,
  employers: 0,
  members: 0,
  applications: 0,
}

export default function HomePage({
  jobs,
  preview = false,
  stats = emptyStats,
}: HomePageProps) {
  return (
    <div className="local-roots-home">
      <section className="home-hero" aria-labelledby="home-title">
        <DotPattern
          className="home-dot-pattern absolute inset-0 text-[#209080]/20 [mask-image:radial-gradient(700px_circle_at_center,white,transparent)]"
          width={24}
          height={24}
          cx={1.5}
          cy={1.5}
          cr={1.5}
        />
        <div className="home-hero-art">
          <Image
            src="/images/home/hero-collage.png"
            alt="Local professionals in hospitality, skilled trades and food service, with an Antigua harbour view"
            fill
            priority
            sizes="(max-width: 700px) 100vw, 55vw"
          />
        </div>
        <div className="home-hero-copy">
          <p className="home-eyebrow">Opportunity, close to home</p>
          <h1 id="home-title">
            Your next chapter{" "}
            <span>starts here.</span>
          </h1>
          <span className="home-coral-stroke hero-stroke" />
          <p className="home-hero-description">
            Find work. Meet local employers. Build your future
            <br className="home-desktop-break" /> in Antigua &amp; Barbuda.
          </p>
          <div className="home-role-rotate">
            Find your next role as a{" "}
            <WordRotate
              className="font-semibold text-[#209080]"
              words={[
                "Chef",
                "Bartender",
                "Accountant",
                "Nurse",
                "Driver",
                "Front-desk Agent",
              ]}
            />
          </div>
          <form action="/jobs" method="get" className="home-search" role="search">
            <label className="home-keyword">
              <Search aria-hidden="true" />
              <span className="sr-only">Job title or keyword</span>
              <input name="q" placeholder="Job title or keyword" />
            </label>
            <label className="home-location">
              <MapPin aria-hidden="true" />
              <span className="sr-only">Location</span>
              <select name="location" defaultValue="">
                <option value="">All locations</option>
                <option>St. John&apos;s</option>
                <option>All Saints</option>
                <option>English Harbour</option>
                <option>Jolly Harbour</option>
                <option>Barbuda</option>
              </select>
              <ChevronDown className="home-select-arrow" aria-hidden="true" />
            </label>
            <button className="home-button" type="submit">
              Find jobs <ArrowRight aria-hidden="true" />
            </button>
          </form>
          <a
            href="#opportunities"
            className="home-search-demo"
            aria-label="Search examples and jump to latest opportunities"
          >
            <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <TypingAnimation
              className="text-sm text-slate-500"
              duration={70}
              words={[
                "bartender in St. John's",
                "accountant in English Harbour",
                "hotel front desk agent",
                "delivery driver",
              ]}
            />
          </a>
          <div className="home-community">
            <Sprout aria-hidden="true" />
            <p>
              Real people. Stronger communities.
              <br />A brighter Antigua &amp; Barbuda.
            </p>
          </div>
        </div>
      </section>

      <section className="home-trust" aria-label="JobLink community activity">
        <div className="home-trust-stats">
          <div className="home-stat">
            <NumberTicker
              value={stats.jobs}
              data-reduced-value={stats.jobs}
              aria-label={`${stats.jobs} jobs posted`}
              className="text-4xl font-bold tabular-nums text-[#102040]"
            />
            <p>Jobs posted</p>
          </div>
          <div className="home-stat">
            <NumberTicker
              value={stats.employers}
              data-reduced-value={stats.employers}
              aria-label={`${stats.employers} employers hiring`}
              className="text-4xl font-bold tabular-nums text-[#102040]"
            />
            <p>Employers hiring</p>
          </div>
          <div className="home-stat">
            <NumberTicker
              value={stats.members}
              data-reduced-value={stats.members}
              aria-label={`${stats.members} members`}
              className="text-4xl font-bold tabular-nums text-[#102040]"
            />
            <p>Members</p>
          </div>
        </div>
        <div className="home-trust-people">
          <AvatarCircles avatarUrls={avatarUrls} numPeople={stats.members} />
          <p>Members across Antigua &amp; Barbuda</p>
        </div>
      </section>

      <nav className="home-industries" aria-label="Browse jobs by industry">
        <span>Find your field</span>
        {[
          ["Hospitality", "Tourism & Hospitality"],
          ["Skilled trades", "Construction"],
          ["Office & admin", "Administrative & Office"],
          ["Retail", "Retail & Trade"],
        ].map(([label, category]) => (
          <Link key={category} href={`/jobs?category=${encodeURIComponent(category)}`}>
            {label}
            <ArrowRight aria-hidden="true" />
          </Link>
        ))}
        <Link href="/jobs">
          All industries
          <ArrowRight aria-hidden="true" />
        </Link>
      </nav>

      <section
        className="home-opportunities"
        id="opportunities"
        aria-labelledby="opportunities-title"
      >
        <span className="home-coral-stroke" />
        <div className="home-section-heading">
          <h2 id="opportunities-title">Find your next opportunity</h2>
          <p className="home-eyebrow">
            {preview ? "Sample listings" : "Latest opportunities"}
          </p>
        </div>
        {jobs.length > 0 && (
          <AnimatedList
            delay={700}
            className={`home-job-grid home-job-grid-${jobs.length}`}
          >
            {jobs.map((job, index) => (
              <div
                key={job.id}
                data-job-index={index}
                className={
                  job.is_featured || job.is_pro_company
                    ? "home-job-shell home-job-shell-featured"
                    : "home-job-shell"
                }
              >
                <Link
                  href={preview ? "/jobs" : `/jobs/${job.id}`}
                  className="home-job-card"
                >
                  <div className={`home-job-monogram home-monogram-${index % 3}`}>
                    {job.company_logo ? (
                      <Image src={job.company_logo} alt="" width={52} height={52} />
                    ) : (
                      job.company_name
                        .split(/\s+/)
                        .map((word) => word[0])
                        .slice(0, 2)
                        .join("")
                    )}
                  </div>
                  <div className="home-job-details">
                    <h3>{job.title}</h3>
                    <p>
                      {job.location} · {job.job_type}
                    </p>
                  </div>
                  <span className="home-company-name">{job.company_name}</span>
                  <ArrowRight className="home-job-arrow" aria-hidden="true" />
                </Link>
                {(job.is_featured || job.is_pro_company) && (
                  <ShineBorder
                    borderWidth={1.5}
                    duration={12}
                    shineColor={["#104080", "#209080"]}
                    className="rounded-[4px]"
                  />
                )}
              </div>
            ))}
          </AnimatedList>
        )}
        {jobs.length === 0 && (
          <div className="home-empty">
            <h3>Your next opportunity is on its way.</h3>
            <p>
              New jobs will appear here as employers post them. Create your free
              profile to get ready.
            </p>
            <Link href="/signup">
              Create your profile <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        )}
        <Link className="home-browse" href="/jobs">
          Browse more jobs <ArrowRight aria-hidden="true" />
        </Link>
        <div className="home-category-marquee">
          <Marquee pauseOnHover className="[--duration:40s] [--gap:0.75rem]">
            {categories.map((category) => (
              <span
                key={category}
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-600"
              >
                {category}
              </span>
            ))}
          </Marquee>
        </div>
      </section>

      <section className="home-how" aria-labelledby="home-how-title">
        <div className="home-how-intro">
          <p className="home-eyebrow">Your next step starts here</p>
          <h2 id="home-how-title">
            A little action.
            <br />A new beginning.
          </h2>
          <Link href="/signup">
            Create your free profile <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <ol>
          <li>
            <BlurFade delay={0.1} inView>
              <MagicCard
                gradientColor="#209080"
                gradientOpacity={0.12}
                className="home-step-magic"
              >
                <div className="home-step-card">
                  <span>01</span>
                  <div>
                    <h3>Tell your story</h3>
                    <p>Add your skills, experience and CV. Let local employers see what you bring.</p>
                  </div>
                </div>
              </MagicCard>
            </BlurFade>
          </li>
          <li>
            <BlurFade delay={0.25} inView>
              <MagicCard
                gradientColor="#209080"
                gradientOpacity={0.12}
                className="home-step-magic"
              >
                <div className="home-step-card">
                  <span>02</span>
                  <div>
                    <h3>Find your opportunity</h3>
                    <p>Explore jobs across the island and apply for the roles that feel right.</p>
                  </div>
                </div>
              </MagicCard>
            </BlurFade>
          </li>
          <li>
            <BlurFade delay={0.4} inView>
              <MagicCard
                gradientColor="#209080"
                gradientOpacity={0.12}
                className="home-step-magic"
              >
                <div className="home-step-card">
                  <span>03</span>
                  <div>
                    <h3>Make your next move</h3>
                    <p>Keep track of your applications and connect with employers in one place.</p>
                  </div>
                </div>
              </MagicCard>
            </BlurFade>
          </li>
        </ol>
      </section>

      <section className="home-employers" id="employers" aria-labelledby="employers-title">
        <h2 id="employers-title" className="sr-only">
          Good people. Great possibilities.
        </h2>
        <BentoGrid className="home-employer-grid">
          <BentoCard
            name="Good people. Great possibilities."
            description="Reach talented, motivated people across Antigua & Barbuda. Post a job and be part of what's next."
            Icon={Building2}
            href="/post-job"
            cta="Start hiring"
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
            href="/post-job"
            cta="Start hiring"
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
            description="Post, review and hire in one local network."
            Icon={Users}
            href="/post-job"
            cta="Start hiring"
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
                <li>Post your vacancy</li>
                <li>Review applications</li>
                <li>Hire</li>
              </ol>
            </div>
            <form action="/post-job">
              <button
                type="submit"
                className="rounded-lg bg-[#104080] px-8 py-3 text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#104080]"
              >
                Find your next hire
              </button>
            </form>
          </div>
        </BentoGrid>
      </section>

      <section className="home-success" aria-labelledby="success-title">
        <span className="home-coral-stroke" />
        <div className="home-section-heading">
          <h2 id="success-title">Success stories</h2>
          <p className="home-eyebrow">Community voices</p>
        </div>
        <div className="home-testimonial-marquees">
          <Marquee pauseOnHover className="[--duration:45s]">
            {testimonials.slice(0, 3).map((testimonial) => (
              <figure
                key={testimonial.role}
                className="w-80 rounded-xl border bg-white p-5 shadow-sm"
              >
                <blockquote className="text-sm text-slate-600">
                  &quot;{testimonial.quote}&quot;
                </blockquote>
                <figcaption className="mt-3 text-sm font-medium text-[#102040]">
                  {testimonial.name}, {testimonial.role}
                </figcaption>
              </figure>
            ))}
          </Marquee>
          <Marquee pauseOnHover reverse className="[--duration:45s]">
            {testimonials.slice(3).map((testimonial) => (
              <figure
                key={testimonial.role}
                className="w-80 rounded-xl border bg-white p-5 shadow-sm"
              >
                <blockquote className="text-sm text-slate-600">
                  &quot;{testimonial.quote}&quot;
                </blockquote>
                <figcaption className="mt-3 text-sm font-medium text-[#102040]">
                  {testimonial.name}, {testimonial.role}
                </figcaption>
              </figure>
            ))}
          </Marquee>
        </div>
      </section>

      {preview && (
        <p className="home-preview-note">
          LOCAL DESIGN PREVIEW · SAMPLE LISTINGS · LIVE SITE UNCHANGED
        </p>
      )}
    </div>
  )
}
