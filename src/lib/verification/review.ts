import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { newConfirmationCode } from './crypto'
import { deleteDocuments } from './files'
import { refundVerification } from './payment'
import { endBadge } from './seeker'
import { logVerificationEvent, seekerEmail, type VerificationRow } from './server'
import {
  DOCUMENT_LABELS, NOT_APPROVED_REASONS, REUPLOAD_REASONS, REVIEW_CHECKLIST, RTW_GROUPS, antiguaToday, isIsoDate,
  longDate, policeRecordIsRecent, verifiedUntil, type RtwDocumentType, type RtwGroup, type VerificationDocument,
} from './shared'

const isoDate = z.string().refine(isIsoDate, 'Enter a valid date')
const groups = Object.keys(RTW_GROUPS) as [RtwGroup, ...RtwGroup[]]
const documentTypes = ['passport', 'national_id', 'residency_document', 'marriage_certificate', 'skills_certificate', 'work_permit'] as const
const reuploadReasons = Object.keys(REUPLOAD_REASONS) as [keyof typeof REUPLOAD_REASONS, ...(keyof typeof REUPLOAD_REASONS)[]]
// "No upload received" is set by the daily job, never chosen by a reviewer.
const refusalReasons = (Object.keys(NOT_APPROVED_REASONS) as (keyof typeof NOT_APPROVED_REASONS)[])
  .filter((reason) => reason !== 'no_upload_received') as [keyof typeof NOT_APPROVED_REASONS, ...(keyof typeof NOT_APPROVED_REASONS)[]]

export const decisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    rtw_group: z.enum(groups),
    rtw_document_type: z.enum(documentTypes),
    rtw_document_expires_on: isoDate.nullable(),
    police_record_issued_on: isoDate,
    sharing_notice: z.boolean(),
    // Every checklist item must be ticked by the reviewer.
    checklist: z.array(z.string()).refine((ticked) => REVIEW_CHECKLIST.every((item) => ticked.includes(item.id)), 'Tick every item on the checklist'),
  }).strict(),
  z.object({
    decision: z.literal('reupload'),
    documents: z.array(z.enum(['rtw', 'police_record'])).min(1).max(2).refine((list) => new Set(list).size === list.length),
    reason: z.enum(reuploadReasons),
  }).strict(),
  z.object({ decision: z.literal('not_approved'), reason: z.enum(refusalReasons) }).strict(),
])
export type Decision = z.infer<typeof decisionSchema>

export class DecisionRefused extends Error {}

async function firstName(db: SupabaseClient, seekerId: string): Promise<string | undefined> {
  const { data } = await db.from('seeker_profiles').select('first_name').eq('id', seekerId).maybeSingle()
  return data?.first_name || undefined
}

/** Remove files that the row no longer points at. Failure is logged for the daily sweep, never hidden. */
async function removeFiles(db: SupabaseClient, row: VerificationRow, actorId: string, files: { kind: VerificationDocument; path: string | null }[]): Promise<boolean> {
  const present = files.filter((file): file is { kind: VerificationDocument; path: string } => !!file.path)
  if (!present.length) return true
  try {
    await deleteDocuments(db, present.map((file) => file.path))
    await logVerificationEvent(db, present.map((file) => ({
      verification_id: row.id, actor_id: actorId, actor_role: 'admin' as const, event: 'file_deleted' as const, document: file.kind,
    })))
    return true
  } catch {
    console.error('[verification-review] File removal failed; the daily job will sweep it', { verificationId: row.id })
    return false
  }
}

export interface DecisionResult { status: string; filesRemoved: boolean }

/**
 * Apply a reviewer's decision to a submitted check.
 *
 * Whatever the decision, the ID image is deleted straight away. The police
 * record is kept only if approved. What a police record says is never an
 * input here: there is no field for it.
 */
export async function decideVerification(db: SupabaseClient, row: VerificationRow, reviewerId: string, decision: Decision): Promise<DecisionResult> {
  if (row.status !== 'submitted') throw new DecisionRefused('This verification has already been decided.')
  const now = new Date().toISOString()
  const today = antiguaToday()
  const email = await seekerEmail(db, row.user_id)
  const name = await firstName(db, row.seeker_id)
  const base = db.from('seeker_verifications')

  if (decision.decision === 'approve') {
    const submittedOn = antiguaToday(new Date(row.submitted_at ?? now))
    // Age is measured on the day they sent it, so waiting for review never costs them.
    if (!policeRecordIsRecent(decision.police_record_issued_on, submittedOn)) {
      throw new DecisionRefused('The police record date is more than 30 days before it was submitted, or in the future. That is a "Not approved" with a refund.')
    }
    if (decision.rtw_document_expires_on && decision.rtw_document_expires_on < today) {
      throw new DecisionRefused('The right-to-work document has expired. That is a "Not approved" with a refund.')
    }
    if (decision.rtw_group === 'work_permit' && !decision.rtw_document_expires_on) {
      throw new DecisionRefused('Enter the expiry date of the work permit.')
    }
    if (!(RTW_GROUPS[decision.rtw_group].documentTypes as readonly RtwDocumentType[]).includes(decision.rtw_document_type)) {
      throw new DecisionRefused('That document type is not accepted for this right-to-work group.')
    }
    const until = verifiedUntil(decision.police_record_issued_on, decision.rtw_document_expires_on)
    if (until < today) throw new DecisionRefused('The badge would already have ended.')

    // A renewal replaces the earlier badge; its stored record goes now.
    const previous = await base.select('*').eq('seeker_id', row.seeker_id).eq('status', 'approved').maybeSingle()
    if (previous.error) throw new Error('Could not load earlier verification')
    if (previous.data) await endBadge(db, previous.data as VerificationRow, 'expired', { id: reviewerId, role: 'admin' })

    let saved = null
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      const result = await db.from('seeker_verifications').update({
        status: 'approved', rtw_group: decision.rtw_group, rtw_document_type: decision.rtw_document_type,
        rtw_document_expires_on: decision.rtw_document_expires_on, police_record_issued_on: decision.police_record_issued_on,
        sharing_notice: decision.sharing_notice, verified_until: until, confirmation_code: newConfirmationCode(),
        rtw_file_path: null, reviewed_at: now, reviewed_by: reviewerId, decision_reason: null,
      }).eq('id', row.id).eq('status', 'submitted').select('id').maybeSingle()
      if (result.error?.code === '23505') continue // confirmation code collision: draw another
      if (result.error) throw new Error('Could not record decision')
      if (!result.data) throw new DecisionRefused('This verification has already been decided.')
      saved = result.data
    }
    if (!saved) throw new Error('Could not record decision')
    const filesRemoved = await removeFiles(db, row, reviewerId, [{ kind: 'rtw', path: row.rtw_file_path }])
    if (email) await sendEmail({ to: email, type: 'verification_approved', data: { applicant_name: name, verification_until: longDate(until), verification_notice: decision.sharing_notice } })
    return { status: 'approved', filesRemoved }
  }

  if (decision.decision === 'reupload') {
    const redo = decision.documents as VerificationDocument[]
    const result = await base.update({
      status: 'reupload_needed', reupload_documents: redo, decision_reason: decision.reason, reviewed_at: now, reviewed_by: reviewerId,
      ...(redo.includes('rtw') ? { rtw_file_path: null } : {}),
      ...(redo.includes('police_record') ? { police_record_file_path: null, police_record_sha256: null, key_version: null } : {}),
    }).eq('id', row.id).eq('status', 'submitted').select('id').maybeSingle()
    if (result.error) throw new Error('Could not record decision')
    if (!result.data) throw new DecisionRefused('This verification has already been decided.')
    const filesRemoved = await removeFiles(db, row, reviewerId, [
      { kind: 'rtw', path: redo.includes('rtw') ? row.rtw_file_path : null },
      { kind: 'police_record', path: redo.includes('police_record') ? row.police_record_file_path : null },
    ])
    if (email) {
      await sendEmail({ to: email, type: 'verification_reupload', data: {
        applicant_name: name, verification_reasons: redo.map((kind) => `${DOCUMENT_LABELS[kind]}: ${REUPLOAD_REASONS[decision.reason]}`),
      } })
    }
    return { status: 'reupload_needed', filesRemoved }
  }

  // Not approved: the refund goes first and is idempotent, so a retry after a
  // failure further down can never refund twice or leave someone unrefunded.
  const refundId = await refundVerification(row)
  const result = await base.update({
    status: 'not_approved', decision_reason: decision.reason, reviewed_at: now, reviewed_by: reviewerId,
    rtw_file_path: null, police_record_file_path: null, sharing_notice: false,
    refunded_at: now, stripe_refund_id: refundId,
  }).eq('id', row.id).eq('status', 'submitted').select('id').maybeSingle()
  if (result.error) throw new Error('Could not record decision')
  if (!result.data) throw new DecisionRefused('This verification has already been decided.')
  await logVerificationEvent(db, { verification_id: row.id, actor_id: reviewerId, actor_role: 'admin', event: 'refunded' })
  const filesRemoved = await removeFiles(db, row, reviewerId, [
    { kind: 'rtw', path: row.rtw_file_path }, { kind: 'police_record', path: row.police_record_file_path },
  ])
  if (email) await sendEmail({ to: email, type: 'verification_not_approved', data: { applicant_name: name, verification_reasons: [NOT_APPROVED_REASONS[decision.reason]] } })
  return { status: 'not_approved', filesRemoved }
}

/** What the review screen may know. File paths and payment ids stay on the server. */
export function reviewView(row: VerificationRow, profile: { first_name: string | null; last_name: string | null } | null) {
  return {
    id: row.id,
    status: row.status,
    name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'No name on profile',
    rtw_group_claimed: row.rtw_group_claimed,
    rtw_group: row.rtw_group,
    rtw_document_type: row.rtw_document_type,
    rtw_document_expires_on: row.rtw_document_expires_on,
    police_record_issued_on: row.police_record_issued_on,
    verified_until: row.verified_until,
    paid_at: row.paid_at,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    decision_reason: row.decision_reason,
    reupload_documents: row.reupload_documents,
    refunded: !!row.refunded_at,
    has_rtw_file: !!row.rtw_file_path,
    has_police_record_file: !!row.police_record_file_path,
  }
}
