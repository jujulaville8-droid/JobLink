import { requireAdminTwoStep } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fileKeyReady } from '@/lib/verification/crypto'
import { reviewView } from '@/lib/verification/review'
import { verificationEnabled, verificationJson, verificationLimit, verificationNotFound, type VerificationRow } from '@/lib/verification/server'

type Row = VerificationRow & { seeker_profiles: { first_name: string | null; last_name: string | null } | null }

/** The review queue and the upload switch. Admins with two-step login only. */
export async function GET() {
  if (!verificationEnabled()) return verificationNotFound()
  const auth = await requireAdminTwoStep()
  if ('error' in auth) return auth.error
  const limited = await verificationLimit('admin', auth.user.id)
  if (limited) return limited
  try {
    const db = createAdminClient()
    const select = '*, seeker_profiles(first_name, last_name)'
    const [settings, paid, waiting, reupload, decided] = await Promise.all([
      db.from('verification_settings').select('uploads_open, opened_at').maybeSingle(),
      db.from('seeker_verifications').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
      // Oldest first: the person who has waited longest is at the top.
      db.from('seeker_verifications').select(select).eq('status', 'submitted').order('submitted_at', { ascending: true }).limit(200),
      db.from('seeker_verifications').select(select).eq('status', 'reupload_needed').order('reviewed_at', { ascending: false }).limit(100),
      db.from('seeker_verifications').select(select).in('status', ['approved', 'not_approved']).order('reviewed_at', { ascending: false }).limit(50),
    ])
    if (settings.error || paid.error || waiting.error || reupload.error || decided.error) throw new Error('load failed')
    const view = (rows: unknown) => (rows as Row[]).map((row) => reviewView(row, row.seeker_profiles))
    return verificationJson({
      uploadsOpen: settings.data?.uploads_open === true,
      openedAt: settings.data?.opened_at ?? null,
      fileKeyReady: fileKeyReady(),
      paidWaiting: paid.count ?? 0,
      waiting: view(waiting.data),
      reupload: view(reupload.data),
      decided: view(decided.data),
    })
  } catch {
    return verificationJson({ error: 'Could not load the review queue.' }, 503)
  }
}
