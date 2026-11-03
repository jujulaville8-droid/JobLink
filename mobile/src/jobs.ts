import { db, friendly } from './client'
export const PAGE_SIZE = 20
export const types: Record<string, string> = { full_time: 'Full time', part_time: 'Part time', contract: 'Contract', seasonal: 'Seasonal' }
export type Job = {
  id: string; title: string; description: string; category: string | null; location: string; job_type: string;
  status: string; created_at: string; expires_at: string | null; is_featured: boolean;
  salary_min: number | null; salary_max: number | null; salary_visible: boolean;
  company: { company_name: string; logo_url: string | null } | null;
}
export const fields = 'id,title,description,category,location,job_type,status,created_at,expires_at,is_featured,salary_min,salary_max,salary_visible,company:companies(company_name,logo_url)'
export async function getJobs(query = '', type = '', page = 0, pages = 1) {
  let request = db.from('job_listings').select(`${fields},company_search:companies()`, { count: 'exact' })
    .eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('is_featured', { ascending: false }).order('created_at', { ascending: false }).order('id')
    .range(page * PAGE_SIZE, (page + pages) * PAGE_SIZE - 1)
  if (query.trim()) {
    const pattern = `%${query.trim().replace(/[\\%_]/g, c => `\\${c}`)}%`
    const quoted = `"${pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    request = request.ilike('company_search.company_name', pattern).or(`title.ilike.${quoted},description.ilike.${quoted},company_search.not.is.null`)
  }
  if (type) request = request.eq('job_type', type)
  const { data, error, count } = await request
  if (error) throw new Error(friendly(error.message, 'Could not load jobs. Check your connection and try again.'))
  return { jobs: data as unknown as Job[], count: count ?? 0 }
}
/** Matches the checks the apply route makes, so a closed job never offers Apply. */
export const isClosed = (job: Job) => job.status !== 'active' || (!!job.expires_at && new Date(job.expires_at) <= new Date())
export function posted(createdAt: string) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
  if (!Number.isFinite(days)) return ''
  if (days <= 0) return 'Posted today'
  if (days === 1) return 'Posted yesterday'
  if (days < 30) return `Posted ${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? 'Posted 1 month ago' : `Posted ${months} months ago`
}
export const hasSalary = (job: Job) => job.salary_visible && (!!job.salary_min || !!job.salary_max)
export function salary(job: Job) {
  if (!hasSalary(job)) return 'Salary discussed with employer'
  const money = (n: number) => `EC$${n.toLocaleString()}`
  return job.salary_min && job.salary_max ? `${money(job.salary_min)}–${money(job.salary_max)} / month`
    : job.salary_min ? `From ${money(job.salary_min)} / month` : `Up to ${money(job.salary_max!)} / month`
}
