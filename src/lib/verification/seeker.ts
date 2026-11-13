import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publicEmployerName } from '@/lib/confidential-employer'
import { deleteDocuments } from './files'
import { loadVerifications, logVerificationEvent, uploadsOpen, verificationCheckoutEnabled, verificationEnabled, type VerificationRow } from './server'
import { antiguaToday, badgeIsValid, daysBetween, longDate, type VerificationDocument } from './shared'

/** What the job seeker's own page may know about a check. No paths, fingerprints or payment ids. */
export function seekerView(row: VerificationRow | null) {
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    paid_at: row.paid_at,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    rtw_group_claimed: row.rtw_group_claimed,
    rtw_group: row.rtw_group,
    rtw_document_type: row.rtw_document_type,
    police_record_issued_on: row.police_record_issued_on,
    verified_until: row.verified_until,
    confirmation_code: row.status === 'approved' ? row.confirmation_code : null,
    sharing_notice: row.status === 'approved' && row.sharing_notice,
    decision_reason: row.decision_reason,
    reupload_documents: row.reupload_documents,
    refunded_at: row.refunded_at,
    has_rtw_file: !!row.rtw_file_path,
    has_police_record_file: !!row.police_record_file_path,
    valid: badgeIsValid(row),
  }
}
export type SeekerVerificationView = NonNullable<ReturnType<typeof seekerView>>

export interface ShareView {
  id: string
  employer: string
  job_title: string
  share_police_record: boolean
  share_rtw: boolean
  shared_at: string
  revoked_at: string | null
  views: { document: VerificationDocument; viewed_at: string }[]
}

type Nested<T> = T | T[] | null
const first = <T,>(value: Nested<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value)

/** Every application that carried documents from this check, and each time an employer opened one. */
export async function loadShares(db: SupabaseClient, verificationId: string): Promise<ShareView[]> {
  const { data, error } = await db.from('verification_shares')
    .select('id, share_police_record, share_rtw, shared_at, revoked_at, applications(job_listings(title, companies(company_name, is_confidential))), verification_views(document, viewed_at)')
    .eq('verification_id', verificationId).order('shared_at', { ascending: false }).limit(200)
  if (error) throw new Error('Could not load shares')
  return (data ?? []).map((row) => {
    const application = first(row.applications as Nested<{ job_listings: Nested<{ title: string; companies: Nested<{ company_name: string; is_confidential: boolean }> }> }>)
    const job = first(application?.job_listings ?? null)
    return {
      id: row.id,
      employer: publicEmployerName(first(job?.companies ?? null)),
      job_title: job?.title ?? 'Job',
      share_police_record: row.share_police_record,
      share_rtw: row.share_rtw,
      shared_at: row.shared_at,
      revoked_at: row.revoked_at,
      views: ((row.verification_views ?? []) as { document: VerificationDocument; viewed_at: string }[])
        .sort((a, b) => b.viewed_at.localeCompare(a.viewed_at)),
    }
  })
}

/**
 * End a badge and delete its stored police record: the job seeker asked, the
 * badge reached its end date, or a newer check replaced it.
 *
 * The file goes first. The row only moves on once storage confirms, because
 * the database refuses a finished check that still points at a file.
 */
export async function endBadge(
  db: SupabaseClient,
  row: Pick<VerificationRow, 'id' | 'user_id' | 'police_record_file_path' | 'rtw_file_path'>,
  outcome: 'withdrawn' | 'expired',
  actor: { id: string | null; role: 'seeker' | 'system' | 'admin' },
): Promise<boolean> {
  await deleteDocuments(db, [row.police_record_file_path, row.rtw_file_path])
  const updated = await db.from('seeker_verifications')
    .update({ status: outcome, police_record_file_path: null, rtw_file_path: null, sharing_notice: false })
    .eq('id', row.id).eq('status', 'approved').select('id').maybeSingle()
  if (updated.error) throw new Error('Could not end verification')
  if (!updated.data) return false
  const now = new Date().toISOString()
  await db.from('verification_shares').update({ revoked_at: now }).eq('verification_id', row.id).is('revoked_at', null)
  if (row.police_record_file_path) {
    await logVerificationEvent(db, { verification_id: row.id, actor_id: actor.id, actor_role: actor.role, event: 'file_deleted', document: 'police_record' })
  }
  return true
}

export interface DashboardCardState { line: string; cta: string; dismissible: boolean }

/**
 * The dashboard card: one line of status. Null when there is nothing to show
 * (Verified off, or sales paused for someone who has never started).
 * Never throws: the dashboard must render without it.
 */
export async function dashboardCard(db: SupabaseClient, userId: string): Promise<DashboardCardState | null> {
  if (!verificationEnabled()) return null
  try {
    const { open, badge } = await loadVerifications(db, userId)
    if (open && open.status !== 'awaiting_payment') {
      if (open.status === 'submitted') return { line: 'Your documents are under review. Usually within 48 hours.', cta: 'View', dismissible: false }
      if (open.status === 'reupload_needed') return { line: 'One of your documents needs uploading again. It\u2019s free.', cta: 'Upload again', dismissible: false }
      return (await uploadsOpen(db))
        ? { line: 'Payment received. Upload your documents to get verified.', cta: 'Upload', dismissible: false }
        : { line: 'Payment received. We\u2019ll email you within 24 hours when your upload is ready.', cta: 'View', dismissible: false }
    }
    if (badgeIsValid(badge)) {
      const left = daysBetween(antiguaToday(), badge!.verified_until!)
      return left <= 30
        ? { line: `Your verified badge ends on ${longDate(badge!.verified_until!)}. Renew to keep it.`, cta: 'Renew', dismissible: false }
        : { line: `Verified until ${longDate(badge!.verified_until!)}.`, cta: 'Manage', dismissible: true }
    }
    if (!verificationCheckoutEnabled()) return null
    return { line: 'Police record and right to work, sorted before you apply. EC$40 for 6 months.', cta: 'Get verified', dismissible: true }
  } catch {
    return null
  }
}
