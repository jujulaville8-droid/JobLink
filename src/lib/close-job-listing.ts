import 'server-only'
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyApplicantsOfJobClosure } from '@/lib/job-closure-notifications'

/** Caller must authorize first. Employers pass their verified company scope and
 * user-scoped client; admins may also close pending listings without applicant mail.
 */
export async function closeJobListing(db: SupabaseClient, jobId: string, companyId?: string): Promise<void> {
  let read = db.from('job_listings').select('status').eq('id', jobId)
  if (companyId) read = read.eq('company_id', companyId)
  const { data: current, error: readError } = await read.single()
  if (readError || !current) throw new Error('Unable to load this listing. Please try again.')
  if (current.status === 'closed' || (companyId && current.status !== 'active')) return

  let update = db.from('job_listings').update({ status: 'closed' })
    .eq('id', jobId).eq('status', current.status)
  if (companyId) update = update.eq('company_id', companyId)
  const { data: closed, error } = await update.select('id').maybeSingle()
  if (error) throw new Error('Unable to close this listing. Please try again.')
  if (!closed) throw new Error('This listing changed. Refresh the page and try again.')
  if (current.status === 'active') after(async () => { await notifyApplicantsOfJobClosure(closed.id) })
}
