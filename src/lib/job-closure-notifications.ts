import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { closedJobIds } from '@/lib/job-closures'

interface Job {
  id: string
  title: string
  category: string | null
  job_type: string | null
  status: string
  location: string | null
  created_at: string
  companies: { company_name: string } | { company_name: string }[] | null
}

const first = <T,>(value: T | T[] | null): T | undefined =>
  Array.isArray(value) ? value[0] : value ?? undefined

/** Rank the full candidate pool before taking four, including code-level closures. */
export function selectClosureSuggestions(job: Pick<Job, 'id' | 'category' | 'job_type'>, candidates: Job[]): Job[] {
  const excluded = new Set([job.id, ...closedJobIds()])
  const category = (candidate: Job) => Number(Boolean(job.category) && candidate.category === job.category)
  const type = (candidate: Job) => Number(Boolean(job.job_type) && candidate.job_type === job.job_type)
  return candidates.filter(candidate => candidate.status === 'active' && !excluded.has(candidate.id))
    .sort((a, b) => category(b) - category(a) || type(b) - type(a) ||
      Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id))
    .slice(0, 4)
}

/**
 * Call only after an authorized active -> closed transition, using after() or await.
 * Durable, unique job/user claims precede provider calls, unlike a read-then-send
 * log. Never release a claim, even on failure: a timeout may mean accepted mail.
 * This gives at-most-once attempts across retries/concurrent closes, not guaranteed
 * inbox delivery. Missing migration/log access fails closed without undoing closure.
 */
export async function notifyApplicantsOfJobClosure(jobId: string) {
  const result = { sent: 0, failed: 0, employer: { sent: 0, failed: 0 } }
  if (!process.env.RESEND_API_KEY) return result
  try {
    const db = createAdminClient()
    const { data: job, error: jobError } = await db.from('job_listings')
      .select('id, title, category, job_type, status, companies(company_name, user_id)').eq('id', jobId).single()
    if (jobError) throw jobError
    if (!job || job.status !== 'closed') return result

    const recipients = new Map<string, string>()
    // Applications can exceed the Data API's default row limit.
    for (let offset = 0; ; offset += 500) {
      const { data: applications, error } = await db.from('applications')
        .select('id, seeker_profiles(user_id, first_name)').eq('job_id', jobId)
        .order('id').range(offset, offset + 499)
      if (error) throw error
      for (const application of applications || []) {
        const seeker = first(application.seeker_profiles)
        if (seeker?.user_id && !recipients.has(seeker.user_id)) recipients.set(seeker.user_id, seeker.first_name || '')
      }
      if (!applications || applications.length < 500) break
    }
    if (!recipients.size) return result

    let suggestions: Job[] = []
    for (let offset = 0; ; offset += 500) {
      const { data: candidates, error } = await db.from('job_listings')
        .select('id, title, category, job_type, status, location, created_at, companies(company_name)')
        .eq('status', 'active').order('id').range(offset, offset + 499)
      if (error) throw error
      suggestions = selectClosureSuggestions(job, [...suggestions, ...(candidates || []) as Job[]])
      if (!candidates || candidates.length < 500) break
    }
    const suggestedJobs = suggestions.map(suggestion => ({
      title: suggestion.title,
      company: first(suggestion.companies)?.company_name || 'An employer',
      location: suggestion.location || 'Antigua & Barbuda',
      url: `https://joblinkantigua.com/jobs/${suggestion.id}`,
    }))

    for (const [userId, firstName] of recipients) {
      try {
        const { data: user, error: userError } = await db.from('users').select('email').eq('id', userId).maybeSingle()
        if (userError) throw userError
        if (!user?.email?.trim()) continue

        // The database uniqueness constraint arbitrates concurrent workers.
        // Do not send if persistence is unavailable (including before migration).
        const { error: claimError } = await db.from('job_closure_notification_log')
          .insert({ job_id: jobId, user_id: userId })
        if (claimError?.code === '23505') continue
        if (claimError) throw claimError

        const sent = await sendEmail({
          to: user.email, type: 'job_closed_applicant',
          idempotencyKey: `job-closed/${jobId}/${userId}`,
          data: {
            applicant_name: firstName, job_title: job.title,
            company_name: first(job.companies)?.company_name || 'The company',
            suggested_jobs: suggestedJobs,
          },
        })
        if (sent.success) result.sent++
        else result.failed++
        const { error: logError } = await db.from('job_closure_notification_log').update({
          status: sent.success ? 'sent' : 'failed',
          ...(sent.success ? { sent_at: new Date().toISOString(), message_id: sent.id } : {}),
        }).eq('job_id', jobId).eq('user_id', userId)
        if (logError) console.warn('[job-closure] Delivery result not recorded; claim retained')
      } catch {
        result.failed++
        // Do not log database/provider errors containing applicant addresses.
        console.error('[job-closure] Recipient processing failed')
      }
    }

    try {
      const company = first(job.companies)
      const userId = company?.user_id
      if (!userId) return result
      const { data: user, error: userError } = await db.from('users').select('email').eq('id', userId).maybeSingle()
      if (userError) throw userError
      if (!user?.email?.trim()) return result

      // If the employer applied to their own listing, the applicant claim wins
      // because applicants are processed first, so the employer summary may be skipped.
      // Never release this claim, even if sending or recording the result fails.
      const { error: claimError } = await db.from('job_closure_notification_log')
        .insert({ job_id: jobId, user_id: userId })
      if (claimError?.code === '23505') return result
      if (claimError) throw claimError

      const sent = await sendEmail({
        to: user.email, type: 'job_closed_employer',
        idempotencyKey: `job-closed/${jobId}/${userId}`,
        data: {
          job_title: job.title, company_name: company.company_name || 'The company',
          applicant_count: result.sent,
        },
      })
      if (sent.success) result.employer.sent++
      else result.employer.failed++
      const { error: logError } = await db.from('job_closure_notification_log').update({
        status: sent.success ? 'sent' : 'failed',
        ...(sent.success ? { sent_at: new Date().toISOString(), message_id: sent.id } : {}),
      }).eq('job_id', jobId).eq('user_id', userId)
      if (logError) console.warn('[job-closure] Delivery result not recorded; claim retained')
    } catch {
      result.employer.failed++
      console.error('[job-closure] Employer processing failed')
    }
  } catch {
    result.failed++
    console.error('[job-closure] Notification processing failed')
  }
  return result
}
