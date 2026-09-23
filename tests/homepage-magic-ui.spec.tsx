import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import HomePage from "@/components/home/HomePage"
import type { Job } from "@/components/JobCard"

const jobs: Job[] = [
  {
    id: "featured-job",
    title: "Front Desk Agent",
    company_name: "Harbour Hotel",
    company_logo: null,
    location: "English Harbour",
    job_type: "Full time",
    salary_min: null,
    salary_max: null,
    salary_visible: false,
    created_at: "2026-09-20T12:00:00.000Z",
    is_featured: true,
    is_pro_company: false,
  },
]

describe("Magic UI homepage", () => {
  it("keeps the existing journey while adding live trust and story content", () => {
    const markup = renderToStaticMarkup(
      <HomePage
        jobs={jobs}
        stats={{ jobs: 12, employers: 7, jobSeekers: 34, applications: 19 }}
      />,
    )

    expect(markup).toContain("Opportunity, close to home")
    expect(markup).toContain("Your next chapter")
    expect(markup).toContain("starts here.")
    expect(markup).toContain("Find work. Meet local employers. Build your future")
    expect(markup).toContain("animate-aurora")
    expect(markup).toContain("animate-blink-cursor")

    expect(markup).toContain("Jobs posted")
    expect(markup).toContain("Employers hiring")
    expect(markup).toContain("Job seekers")
    expect(markup).toContain("Job seekers across Antigua &amp; Barbuda")

    expect(markup).toContain('id="opportunities"')
    expect(markup).toContain("Front Desk Agent")
    expect(markup).toContain("Hospitality")
    expect(markup).toContain("Customer Service")

    expect(markup).toContain("Tell your story")
    expect(markup).toContain("Find your opportunity")
    expect(markup).toContain("Make your next move")

    expect(markup).toContain("Good people.")
    expect(markup).toContain("Great possibilities.")
    expect(markup).toContain("Applications delivered")
    expect(markup).toContain("Post your vacancy")
    expect(markup).toContain('action="/post-job"')
    expect(markup).toContain("Find your next hire")

    expect(markup).toContain("Success stories")
    expect(markup).toContain("Sample testimonial")

    expect(markup).toContain("motion-safe:animate-shine")
    expect(markup).toContain("animate-marquee")
    expect(markup).toContain("animate-orbit")
    expect(markup).toContain("animate-magic-pulse")
    expect(markup).toContain("home-job-grid-1")
    expect(markup).toContain('data-job-index="0"')
    expect(markup).toContain('data-reduced-value="12"')
  })

  it("reserves animated layout space and freezes decorative motion accessibly", () => {
    const homeCss = readFileSync(
      join(process.cwd(), "src/components/home/home.css"),
      "utf8",
    )
    const globalCss = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    )

    expect(homeCss).toContain(".home-job-grid-3")
    expect(homeCss).toContain("data-job-index=\"0\"")
    expect(homeCss).toContain("animation:home-dot-drift")
    expect(homeCss).toContain(".home-step-card{background:transparent")
    expect(globalCss).toContain(".home-role-rotate")
    expect(globalCss).toContain(".home-search-demo")
    expect(globalCss).toContain(".home-dot-pattern")
  })
})
