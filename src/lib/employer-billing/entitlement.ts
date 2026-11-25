import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { employerBillingEnabled } from './config'

export interface CompanyEntitlement {
  pro: boolean
  /** Where Pro comes from: a settled billing month, or a manual / complimentary grant. */
  source: 'paid' | 'grant' | null
  /** End of the latest settled month, for a paid subscription. */
  paidThrough: string | null
}

/**
 * The one server-side answer to "may this company use Pro features?".
 * Every Pro surface (directory, candidate pages, invitations, CV download and
 * export) asks this. Fails closed: an error means no Pro.
 *
 * While employer pricing is switched off, the legacy rule applies: the
 * company's is_pro flag and its expiry.
 */
export async function companyEntitlement(db: SupabaseClient, companyId: string | null | undefined): Promise<CompanyEntitlement> {
  const none: CompanyEntitlement = { pro: false, source: null, paidThrough: null }
  if (!companyId) return none
  try {
    const { data: company, error } = await db.from('companies').select('is_pro, pro_expires_at').eq('id', companyId).maybeSingle()
    if (error || !company) return none
    const grant = company.is_pro === true && (!company.pro_expires_at || new Date(company.pro_expires_at) > new Date())
    if (!employerBillingEnabled()) return grant ? { pro: true, source: 'grant', paidThrough: null } : none

    const graceStart = new Date(Date.now() - 86_400_000).toISOString()
    const { data: periods, error: periodError } = await db.from('employer_pro_periods')
      .select('period_start, period_end').eq('company_id', companyId).is('revoked_at', null)
      .gt('period_end', graceStart).order('period_end', { ascending: false }).limit(1)
    if (periodError) return grant ? { pro: true, source: 'grant', paidThrough: null } : none
    const period = periods?.[0]
    if (period && new Date(period.period_start) <= new Date()) return { pro: true, source: 'paid', paidThrough: period.period_end }
    return grant ? { pro: true, source: 'grant', paidThrough: null } : none
  } catch {
    return none
  }
}

/** The company an employer account owns, if any. */
export async function companyForUser(db: SupabaseClient, userId: string): Promise<{ id: string; company_name: string } | null> {
  const { data } = await db.from('companies').select('id, company_name').eq('user_id', userId).maybeSingle()
  return data ?? null
}

/** Whether the candidate directory is restricted to Pro right now. Fails open to the current state (off). */
export async function directoryGated(db: SupabaseClient): Promise<boolean> {
  if (!employerBillingEnabled()) return false
  const { data, error } = await db.from('employer_billing_settings').select('directory_gated').maybeSingle()
  return !error && data?.directory_gated === true
}

/**
 * May this employer browse and open candidate profiles? Admins always may.
 * Own applicants are separate: they are always reachable through the
 * application, Pro or not.
 */
export async function directoryAccess(db: SupabaseClient, companyId: string | null | undefined, isAdmin = false): Promise<boolean> {
  if (isAdmin) return true
  if (!(await directoryGated(db))) return true
  return (await companyEntitlement(db, companyId)).pro
}
