import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

function createQueryResult<T>(result: T) {
  const query = {
    select: () => query,
    eq: () => query,
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
    expect(markup).toContain('aria-label="34 job seekers"')
    expect(markup).toContain('aria-label="19 applications delivered"')
  })
})
