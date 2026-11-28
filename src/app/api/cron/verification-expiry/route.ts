import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteDocuments, privateVerificationStorage } from '@/lib/verification/files'
import { endBadge } from '@/lib/verification/seeker'
import { logVerificationEvent, ownerAlert, seekerEmail, verificationEnabled, type VerificationRow } from '@/lib/verification/server'
import { antiguaToday, longDate } from '@/lib/verification/shared'

export const maxDuration = 300

const REMINDER_DAYS = 30
const REVIEW_ALERT_HOURS = 24
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

async function firstName(db: SupabaseClient, seekerId: string) {
  const { data } = await db.from('seeker_profiles').select('first_name').eq('id', seekerId).maybeSingle()
  return data?.first_name || undefined
}

/**
 * Daily job for JobLink Verified:
 *   1. End badges past their end date and tell the job seeker.
 *   2. Remind 30 days before a badge ends, once.
 *   3. Alert the owner if any review has waited over 24 hours.
 *   4. Delete any stored image nothing points at any more.
 * Each row on its own, so one failure never blocks the rest; safe to run twice.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!verificationEnabled()) return NextResponse.json({ skipped: 'disabled' })

  const db = createAdminClient()
  const today = antiguaToday()
  const result = { expired: 0, reminders: 0, reviews_waiting: 0, swept: 0, failed: 0 }
  const rows = async (query: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await query
    if (error) { result.failed++; return [] as VerificationRow[] }
    return (data ?? []) as VerificationRow[]
  }

  for (const row of await rows(db.from('seeker_verifications').select('*').eq('status', 'approved').lt('verified_until', today).limit(500))) {
    try {
      if (await endBadge(db, row, 'expired', { id: null, role: 'system' })) {
        result.expired++
        const email = await seekerEmail(db, row.user_id)
        if (email) await sendEmail({ to: email, type: 'verification_expired', data: { applicant_name: await firstName(db, row.seeker_id) } })
      }
    } catch { result.failed++ }
  }

  for (const row of await rows(db.from('seeker_verifications').select('*').eq('status', 'approved')
    .lte('verified_until', addDays(today, REMINDER_DAYS)).gte('verified_until', today).is('expiry_reminder_sent_at', null).limit(500))) {
    try {
      // Claim first: a crash after sending must not send it again tomorrow.
      const claimed = await db.from('seeker_verifications').update({ expiry_reminder_sent_at: new Date().toISOString() })
        .eq('id', row.id).is('expiry_reminder_sent_at', null).select('id').maybeSingle()
      if (claimed.error || !claimed.data) continue
      const email = await seekerEmail(db, row.user_id)
      if (email) await sendEmail({ to: email, type: 'verification_expiring', data: { applicant_name: await firstName(db, row.seeker_id), verification_until: longDate(row.verified_until!) } })
      await logVerificationEvent(db, { verification_id: row.id, actor_id: null, actor_role: 'system', event: 'reminder_sent' })
      result.reminders++
    } catch { result.failed++ }
  }

  const waiting = await db.from('seeker_verifications').select('id', { count: 'exact', head: true })
    .eq('status', 'submitted').lt('submitted_at', new Date(Date.now() - REVIEW_ALERT_HOURS * 3_600_000).toISOString())
  result.reviews_waiting = waiting.count ?? 0
  if (result.reviews_waiting > 0) {
    await ownerAlert('JobLink Verified: reviews are waiting', `${result.reviews_waiting} verification review(s) have waited more than 24 hours. Open Admin > Verifications.`)
  }

  try {
    const storage = await privateVerificationStorage(db)
    const folders = await storage.list('', { limit: 1000 })
    for (const folder of folders.data ?? []) {
      if (!/^[0-9a-f-]{36}$/.test(folder.name)) continue
      const [files, owner] = await Promise.all([
        storage.list(folder.name, { limit: 100 }),
        db.from('seeker_verifications').select('rtw_file_path').eq('id', folder.name).maybeSingle(),
      ])
      if (files.error || owner.error) { result.failed++; continue }
      // Leave anything from the last hour alone: an upload may be in flight.
      const orphans = (files.data ?? [])
        .filter((file) => `${folder.name}/${file.name}` !== owner.data?.rtw_file_path && Date.parse(file.created_at ?? '') < Date.now() - 3_600_000)
        .map((file) => `${folder.name}/${file.name}`)
      if (!orphans.length) continue
      await deleteDocuments(db, orphans)
      if (owner.data) {
        await logVerificationEvent(db, orphans.map(() => ({ verification_id: folder.name, actor_id: null, actor_role: 'system' as const, event: 'file_deleted' as const })))
      }
      result.swept += orphans.length
    }
  } catch { result.failed++ }

  if (result.failed > 0) console.error('[verification-expiry] Some steps failed', result)
  return NextResponse.json(result)
}
