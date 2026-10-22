import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { INDUSTRIES } from '@/lib/types'

export default async function JobIndustryShortcuts() {
  const supabase = await createClient()
  const counts = new Map<string, number>()
  // Read only categories, paging beyond PostgREST's default row limit.
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from('job_listings').select('category')
      .eq('status', 'active')
      .order('id').range(start, start + 999)
    if (error) return null
    for (const job of data ?? []) {
      if (INDUSTRIES.includes(job.category)) counts.set(job.category, (counts.get(job.category) ?? 0) + 1)
    }
    if (!data || data.length < 1000) break
  }
  const categories = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6)
  if (!categories.length) return null
  return <section aria-labelledby="industry-shortcuts" className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
    <h2 id="industry-shortcuts" className="shrink-0 text-sm font-semibold text-text">Browse by industry</h2>
    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {categories.map(([category, count]) => <li key={category}>
        <Link
          href={`/jobs?category=${encodeURIComponent(category)}`}
          className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-white px-4 text-sm text-text transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          {category}
          <span className="text-xs text-text-light">{count} {count === 1 ? "open job" : "open jobs"}</span>
        </Link>
      </li>)}
    </ul>
  </section>
}
