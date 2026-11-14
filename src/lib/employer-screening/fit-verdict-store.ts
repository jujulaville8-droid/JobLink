import 'server-only'
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
export async function loadFitVerdicts(db: SupabaseClient, applicationIds: string[]): Promise<Map<string, string>> {
  if (!applicationIds.length) return new Map()
  try {
    const { data, error } = await db.from('application_fit_verdicts').select('application_id, verdict_text').in('application_id', applicationIds)
    if (error) return new Map()
    return new Map((data ?? []).filter(row => typeof row.verdict_text === 'string').map(row => [row.application_id, row.verdict_text]))
  } catch { return new Map() }
}
