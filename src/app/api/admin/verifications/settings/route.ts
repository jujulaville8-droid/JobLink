import { requireAdminTwoStep } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { createAdminClient } from '@/lib/supabase/admin'
import { fileKeyReady } from '@/lib/verification/crypto'
import { privateVerificationStorage } from '@/lib/verification/files'
import { sameOrigin, verificationEnabled, verificationJson, verificationLimit, verificationNotFound } from '@/lib/verification/server'

export const maxDuration = 120

/**
 * Opens uploads after the Supabase upgrade, and emails everyone waiting.
 * One way: the database refuses to close them again while documents are stored.
 */
export async function POST(request: Request) {
  if (!verificationEnabled()) return verificationNotFound()
  if (!sameOrigin(request)) return verificationJson({ error: 'Invalid request.' }, 400)
  const auth = await requireAdminTwoStep()
  if ('error' in auth) return auth.error
  const limited = await verificationLimit('adminDecision', auth.user.id)
  if (limited) return limited

  let body: { upgraded?: unknown }
  try { body = await request.json() } catch { return verificationJson({ error: 'Invalid request.' }, 400) }
  if (body?.upgraded !== true) {
    return verificationJson({ error: 'Confirm that Supabase has been upgraded to Pro and the data processing agreement accepted.' }, 400)
  }
  if (!fileKeyReady()) {
    return verificationJson({ error: 'The file encryption key (VERIFICATION_FILE_KEY) is not set in Vercel. Uploads cannot open without it.' }, 409)
  }

  try {
    const db = createAdminClient()
    // Refuses if the folder is missing or has been made public.
    await privateVerificationStorage(db)
    const opened = await db.from('verification_settings')
      .update({ uploads_open: true, opened_at: new Date().toISOString(), opened_by: auth.user.id })
      .eq('uploads_open', false).select('uploads_open').maybeSingle()
    if (opened.error) throw new Error('update failed')
    if (!opened.data) return verificationJson({ success: true, alreadyOpen: true, emailed: 0 })

    const waiting = await db.from('seeker_verifications').select('user_id, users!seeker_verifications_user_id_fkey(email)').eq('status', 'paid').limit(1000)
    let emailed = 0
    for (const row of waiting.data ?? []) {
      const account = Array.isArray(row.users) ? row.users[0] : row.users
      const email = (account as { email?: string } | null)?.email
      if (email && (await sendEmail({ to: email, type: 'verification_upload_ready' })).success) emailed++
    }
    return verificationJson({ success: true, emailed, waiting: waiting.data?.length ?? 0 })
  } catch {
    return verificationJson({ error: 'Uploads were not opened. Check that the private storage folder exists, then try again.' }, 503)
  }
}
