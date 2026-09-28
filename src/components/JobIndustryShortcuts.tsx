import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { INDUSTRIES } from '@/lib/types'
import { BentoGrid } from '@/components/magicui/bento-grid'

export default async function JobIndustryShortcuts() {
  const supabase = await createClient()
  const counts = new Map<string, number>()
  const now = new Date().toISOString()
  // Read only categories, paging beyond PostgREST's default row limit.
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from('job_listings').select('category')
      .eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('id').range(start, start + 999)
    if (error) return null
    for (const job of data ?? []) {
      if (INDUSTRIES.includes(job.category)) counts.set(job.category, (counts.get(job.category) ?? 0) + 1)
    }
    if (!data || data.length < 1000) break
  }
  const categories = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6)
  if (!categories.length) return null
  return <section aria-labelledby="industry-shortcuts" className="mb-6">
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id="industry-shortcuts" className="text-sm font-semibold text-text">Browse by industry</h2>
      <p className="text-xs text-text-light">Explore industries with open vacancies</p>
    </div>
    <BentoGrid className="auto-rows-auto grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {categories.map(([category, count]) => <Link key={category}
        href={`/jobs?category=${encodeURIComponent(category)}`}
        className="flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-border bg-white p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <span className="text-sm font-semibold leading-snug text-text">{category}</span>
        <span className="text-xs text-primary">{count} {count === 1 ? 'open job' : 'open jobs'} <span aria-hidden="true">→</span></span>
      </Link>)}
    </BentoGrid>
  </section>
}
