import 'server-only'
import { NOT_SCREENED_TEXT, type NotScreenedReason } from './not-screened'
import type { SupabaseClient } from '@supabase/supabase-js'
import { simpleFitEmailText, type SimpleFitVerdict } from './simple-fit'

/** Separate from seeker-readable applications; migration may not yet be installed. */
export async function saveFitVerdict(db: SupabaseClient, applicationId: string, verdict: SimpleFitVerdict): Promise<void> {
  try {
    const { error } = await db.from('application_fit_verdicts').upsert({ application_id: applicationId,
      verdict: verdict.verdict, verdict_text: simpleFitEmailText(verdict) }, { onConflict: 'application_id' })
    if (error) console.warn('[applicant-notification] Fit verdict not recorded')
  } catch { console.warn('[applicant-notification] Fit verdict not recorded') }
}
export async function loadFitVerdicts(db: SupabaseClient, applicationIds: string[]): Promise<Map<string, { verdict: string; text: string }>> {
  if (!applicationIds.length) return new Map()
  try {
    const { data, error } = await db.from('application_fit_verdicts').select('application_id, verdict, verdict_text').in('application_id', applicationIds)
    if (error) return new Map()
    return new Map((data ?? []).filter(row => typeof row.verdict_text === 'string').map(row => [row.application_id, { verdict: row.verdict, text: row.verdict_text }]))
  } catch { return new Map() }
}

/** A late or repeated failed forward must never overwrite an existing outcome. */
export async function saveNotScreened(db: SupabaseClient, applicationId: string, reason: NotScreenedReason): Promise<void> {
  try {
    const { error } = await db.from('application_fit_verdicts').upsert({
      application_id: applicationId, verdict: 'not_screened', verdict_text: NOT_SCREENED_TEXT[reason],
    }, { onConflict: 'application_id', ignoreDuplicates: true })
    if (error) console.warn('[applicant-notification] Not-screened outcome not recorded')
  } catch { console.warn('[applicant-notification] Not-screened outcome not recorded') }
}
