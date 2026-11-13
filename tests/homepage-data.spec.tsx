import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { NumberTicker } from "@/components/magicui/number-ticker"

function createQueryResult<T>(result: T) {
  const query = {
    select: () => query,
    eq: () => query,
    not: () => query,
    or: () => query,
    order: () => query,
    limit: () => query,
    range: () => query,
    then: (
      resolve: (value: T) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }

  return query
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => createQueryResult({ data: [], error: null }),
  }),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const counts: Record<string, number> = {
        job_listings: 12,
        companies: 7,
        seeker_profiles: 34,
        users: 73,
        applications: 19,
      }

      const data =
        table === "job_listings"
          ? Array.from({ length: 7 }, (_, index) => ({
              company_id: `company-${index + 1}`,
            }))
          : null

      return createQueryResult({ count: counts[table], data, error: null })
    },
  }),
}))

import Home from "@/app/page"

describe("homepage data", () => {
  it("passes real aggregate counts from the server into the trust sections", async () => {
    const markup = renderToStaticMarkup(await Home())

    expect(markup).toContain('aria-label="12 jobs posted"')
    expect(markup).toContain('aria-label="7 employers hiring"')
    expect(markup).toContain('aria-label="73 members"')
    expect(markup).not.toContain('aria-label="34 job seekers"')
    expect(markup).toContain('aria-label="19 applications delivered"')

    expect(markup).toMatch(/aria-label="12 jobs posted"[^>]*>12</)
    expect(markup).toMatch(/aria-label="7 employers hiring"[^>]*>7</)
    expect(markup).toMatch(/aria-label="73 members"[^>]*>73</)
    expect(markup).toMatch(/aria-label="19 applications delivered"[^>]*>19</)
    expect(markup).not.toMatch(/aria-label="(?:12 jobs posted|7 employers hiring|73 members|19 applications delivered)"[^>]*>0</)
  })
})

describe("number ticker server markup", () => {
  it("prints the settled count instead of the animation start", () => {
    const markup = renderToStaticMarkup(
      <NumberTicker value={1000} aria-label="1000 jobs posted" />,
    )

    expect(markup).toContain(">1,000<")
    expect(markup).toMatch(/aria-label="1000 jobs posted"[^>]*>1,000</)
    expect(markup).not.toContain(">0<")
  })

  it("settles a downward ticker on its end value", () => {
    const markup = renderToStaticMarkup(
      <NumberTicker value={1000} startValue={8} direction="down" />,
    )

    expect(markup).toContain(">8<")
    expect(markup).not.toContain(">1,000<")
  })
})
