import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publicEmployerName } from '@/lib/confidential-employer'
import { deleteDocuments } from './files'
import {
  loadVerifications, logVerificationEvent, uploadsOpen, verificationEnabled, verificationUploadsReady, type VerificationRow,
} from './server'
import { antiguaToday, badgeIsValid, daysBetween, longDate } from './shared'

/** What the job seeker's own page may know about a check. No paths or fingerprints. */
export function seekerView(row: VerificationRow | null) {
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    rtw_group_claimed: row.rtw_group_claimed,
    rtw_group: row.rtw_group,
    rtw_document_type: row.rtw_document_type,
    rtw_document_expires_on: row.rtw_document_expires_on,
    verified_until: row.verified_until,
    confirmation_code: row.status === 'approved' ? row.confirmation_code : null,
    decision_reason: row.decision_reason,
    has_file: !!row.rtw_file_path,
    valid: badgeIsValid(row),
  }
}
export type SeekerVerificationView = NonNullable<ReturnType<typeof seekerView>>

export interface ShareView {
  id: string
  employer: string
  job_title: string
  shared_at: string
  revoked_at: string | null
  views: { viewed_at: string }[]
}

type Nested<T> = T | T[] | null
const first = <T,>(value: Nested<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value)

/** Every application that carried the confirmation, and each time an employer opened it. */
export async function loadShares(db: SupabaseClient, verificationId: string): Promise<ShareView[]> {
  const { data, error } = await db.from('verification_shares')
    .select('id, shared_at, revoked_at, applications(job_listings(title, companies(company_name, is_confidential))), verification_views(viewed_at)')
    .eq('verification_id', verificationId).order('shared_at', { ascending: false }).limit(200)
  if (error) throw new Error('Could not load shares')
  return (data ?? []).map((row) => {
    const application = first(row.applications as Nested<{ job_listings: Nested<{ title: string; companies: Nested<{ company_name: string; is_confidential: boolean }> }> }>)
    const job = first(application?.job_listings ?? null)
    return {
      id: row.id,
      employer: publicEmployerName(first(job?.companies ?? null)),
      job_title: job?.title ?? 'Job',
      shared_at: row.shared_at,
      revoked_at: row.revoked_at,
      views: ((row.verification_views ?? []) as { viewed_at: string }[]).sort((a, b) => b.viewed_at.localeCompare(a.viewed_at)),
    }
  })
}

/**
 * End a badge: the job seeker removed it, it reached its end date, or a newer
 * check replaced it. Any image still held (there should be none once decided)
 * is deleted first, and every share is stopped.
 */
export async function endBadge(
  db: SupabaseClient,
  row: Pick<VerificationRow, 'id' | 'rtw_file_path'>,
  outcome: 'withdrawn' | 'expired',
  actor: { id: string | null; role: 'seeker' | 'system' | 'admin' },
): Promise<boolean> {
  if (row.rtw_file_path) await deleteDocuments(db, [row.rtw_file_path])
  const updated = await db.from('seeker_verifications').update({ status: outcome, rtw_file_path: null })
    .eq('id', row.id).eq('status', 'approved').select('id').maybeSingle()
  if (updated.error) throw new Error('Could not end verification')
  if (!updated.data) return false
  await db.from('verification_shares').update({ revoked_at: new Date().toISOString() }).eq('verification_id', row.id).is('revoked_at', null)
  if (row.rtw_file_path) {
    await logVerificationEvent(db, { verification_id: row.id, actor_id: actor.id, actor_role: actor.role, event: 'file_deleted' })
  }
  return true
}

export interface DashboardCardState { line: string; cta: string; dismissible: boolean }

/** The dashboard card: one line of status. Null when there is nothing to show. Never throws. */
export async function dashboardCard(db: SupabaseClient, userId: string): Promise<DashboardCardState | null> {
  if (!verificationEnabled()) return null
  try {
    const { open, badge } = await loadVerifications(db, userId)
    if (open?.status === 'submitted') return { line: 'Your document is being checked. Usually within 48 hours.', cta: 'View', dismissible: false }
    if (open?.status === 'reupload_needed') return { line: 'We need your document again before we can verify you.', cta: 'Upload again', dismissible: false }
    if (badgeIsValid(badge)) {
      const left = daysBetween(antiguaToday(), badge!.verified_until!)
      return left <= 30
        ? { line: `Your verified badge ends on ${longDate(badge!.verified_until!)}. Upload your new document to keep it.`, cta: 'Renew', dismissible: false }
        : { line: 'You’re verified eligible to work in Antigua.', cta: 'Manage', dismissible: true }
    }
    if (!verificationUploadsReady() || !(await uploadsOpen(db))) return null
    return { line: 'Show employers you can work in Antigua. Free, and checked once.', cta: 'Get verified', dismissible: true }
  } catch {
    return null
  }
}
