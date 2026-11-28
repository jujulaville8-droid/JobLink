import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { newConfirmationCode } from './crypto'
import { deleteDocuments } from './files'
import { endBadge } from './seeker'
import { logVerificationEvent, seekerEmail, type VerificationRow } from './server'
import {
  NOT_APPROVED_REASONS, REUPLOAD_REASONS, REVIEW_CHECKLIST, RTW_GROUPS, antiguaToday, badgeText, isIsoDate,
  longDate, verifiedUntil, type RtwDocumentType, type RtwGroup,
} from './shared'

const isoDate = z.string().refine(isIsoDate, 'Enter a valid date')
const groups = Object.keys(RTW_GROUPS) as [RtwGroup, ...RtwGroup[]]
const documentTypes = ['passport', 'national_id', 'residency_document', 'marriage_certificate', 'skills_certificate', 'work_permit'] as const
const reuploadReasons = Object.keys(REUPLOAD_REASONS) as [keyof typeof REUPLOAD_REASONS, ...(keyof typeof REUPLOAD_REASONS)[]]
const refusalReasons = Object.keys(NOT_APPROVED_REASONS) as [keyof typeof NOT_APPROVED_REASONS, ...(keyof typeof NOT_APPROVED_REASONS)[]]

export const decisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    rtw_group: z.enum(groups),
    rtw_document_type: z.enum(documentTypes),
    rtw_document_expires_on: isoDate.nullable(),
    // Every checklist item must be ticked by the reviewer.
    checklist: z.array(z.string()).refine((ticked) => REVIEW_CHECKLIST.every((item) => ticked.includes(item.id)), 'Tick every item on the checklist'),
  }).strict(),
  z.object({ decision: z.literal('reupload'), reason: z.enum(reuploadReasons) }).strict(),
  z.object({ decision: z.literal('not_approved'), reason: z.enum(refusalReasons) }).strict(),
])
export type Decision = z.infer<typeof decisionSchema>

export class DecisionRefused extends Error {}

async function firstName(db: SupabaseClient, seekerId: string): Promise<string | undefined> {
  const { data } = await db.from('seeker_profiles').select('first_name').eq('id', seekerId).maybeSingle()
  return data?.first_name || undefined
}

/** Remove the image after the decision. Failure is logged for the daily sweep, never hidden. */
async function removeImage(db: SupabaseClient, row: VerificationRow, actorId: string): Promise<boolean> {
  if (!row.rtw_file_path) return true
  try {
    await deleteDocuments(db, [row.rtw_file_path])
    await logVerificationEvent(db, { verification_id: row.id, actor_id: actorId, actor_role: 'admin', event: 'file_deleted' })
    return true
  } catch {
    console.error('[verification-review] Image removal failed; the daily job will sweep it', { verificationId: row.id })
    return false
  }
}

export interface DecisionResult { status: string; filesRemoved: boolean }

/** Apply a reviewer's decision. Whatever the decision, the image is deleted straight away. */
export async function decideVerification(db: SupabaseClient, row: VerificationRow, reviewerId: string, decision: Decision): Promise<DecisionResult> {
  if (row.status !== 'submitted') throw new DecisionRefused('This verification has already been decided.')
  const now = new Date().toISOString()
  const today = antiguaToday()
  const email = await seekerEmail(db, row.user_id)
  const name = await firstName(db, row.seeker_id)
  const decided = { rtw_file_path: null, rtw_file_sha256: null, key_version: null, reviewed_at: now, reviewed_by: reviewerId }

  if (decision.decision === 'approve') {
    if (decision.rtw_document_expires_on && decision.rtw_document_expires_on <= today) {
      throw new DecisionRefused('The document has expired. That is a "Not approved".')
    }
    if (decision.rtw_group === 'work_permit' && !decision.rtw_document_expires_on) {
      throw new DecisionRefused('Enter the expiry date of the work permit.')
    }
    if (!(RTW_GROUPS[decision.rtw_group].documentTypes as readonly RtwDocumentType[]).includes(decision.rtw_document_type)) {
      throw new DecisionRefused('That document type is not accepted for this right-to-work group.')
    }
    const until = verifiedUntil(today, decision.rtw_document_expires_on)

    // A renewal replaces the earlier badge.
    const previous = await db.from('seeker_verifications').select('*').eq('seeker_id', row.seeker_id).eq('status', 'approved').maybeSingle()
    if (previous.error) throw new Error('Could not load earlier verification')
    if (previous.data) await endBadge(db, previous.data as VerificationRow, 'expired', { id: reviewerId, role: 'admin' })

    let saved = null
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      const result = await db.from('seeker_verifications').update({
        ...decided, status: 'approved', rtw_group: decision.rtw_group, rtw_document_type: decision.rtw_document_type,
        rtw_document_expires_on: decision.rtw_document_expires_on, verified_until: until,
        confirmation_code: newConfirmationCode(), decision_reason: null,
      }).eq('id', row.id).eq('status', 'submitted').select('id').maybeSingle()
      if (result.error?.code === '23505') continue // confirmation code collision: draw another
      if (result.error) throw new Error('Could not record decision')
      if (!result.data) throw new DecisionRefused('This verification has already been decided.')
      saved = result.data
    }
    if (!saved) throw new Error('Could not record decision')
    const filesRemoved = await removeImage(db, row, reviewerId)
    if (email) {
      await sendEmail({ to: email, type: 'verification_approved', data: {
        applicant_name: name, verification_until: longDate(until), verified_line: badgeText({ holdsWorkPermit: decision.rtw_group === 'work_permit' }),
      } })
    }
    return { status: 'approved', filesRemoved }
  }

  const status = decision.decision === 'reupload' ? 'reupload_needed' : 'not_approved'
  const result = await db.from('seeker_verifications').update({ ...decided, status, decision_reason: decision.reason })
    .eq('id', row.id).eq('status', 'submitted').select('id').maybeSingle()
  if (result.error) throw new Error('Could not record decision')
  if (!result.data) throw new DecisionRefused('This verification has already been decided.')
  const filesRemoved = await removeImage(db, row, reviewerId)
  if (email) {
    await sendEmail({
      to: email, type: decision.decision === 'reupload' ? 'verification_reupload' : 'verification_not_approved',
      data: { applicant_name: name, verification_reasons: [decision.decision === 'reupload' ? REUPLOAD_REASONS[decision.reason] : NOT_APPROVED_REASONS[decision.reason]] },
    })
  }
  return { status, filesRemoved }
}

/** What the review screen may know. File paths stay on the server. */
export function reviewView(row: VerificationRow, profile: { first_name: string | null; last_name: string | null } | null) {
  return {
    id: row.id,
    status: row.status,
    name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'No name on profile',
    rtw_group_claimed: row.rtw_group_claimed,
    rtw_group: row.rtw_group,
    rtw_document_type: row.rtw_document_type,
    rtw_document_expires_on: row.rtw_document_expires_on,
    verified_until: row.verified_until,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    decision_reason: row.decision_reason,
    has_file: !!row.rtw_file_path,
  }
}
