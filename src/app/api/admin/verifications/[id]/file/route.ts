import { z } from 'zod'
import { requireAdminTwoStep } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { documentHeaders, readDocument } from '@/lib/verification/files'
import { logVerificationEvent, verificationEnabled, verificationLimit, verificationNotFound, type VerificationRow } from '@/lib/verification/server'

export const maxDuration = 30

/**
 * Streams one document to the reviewer and logs the open against them.
 * Only while the check is waiting for a decision: once decided, the reviewer
 * has no further reason to open anyone's documents.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verificationEnabled()) return verificationNotFound()
  const auth = await requireAdminTwoStep()
  if ('error' in auth) return auth.error
  const { id } = await params
  const kind = new URL(request.url).searchParams.get('document')
  if (!z.uuid().safeParse(id).success || (kind !== 'rtw' && kind !== 'police_record')) return verificationNotFound()
  const limited = await verificationLimit('admin', auth.user.id)
  if (limited) return limited
  try {
    const db = createAdminClient()
    const found = await db.from('seeker_verifications').select('*').eq('id', id).maybeSingle()
    if (found.error) throw new Error('load failed')
    const row = found.data as VerificationRow | null
    const path = kind === 'rtw' ? row?.rtw_file_path : row?.police_record_file_path
    if (!row || row.status !== 'submitted' || !path) return verificationNotFound()
    const pdf = await readDocument(db, row.id, kind, path, kind === 'police_record' ? row.police_record_sha256 : null)
    await logVerificationEvent(db, { verification_id: row.id, actor_id: auth.user.id, actor_role: 'admin', event: 'file_opened_by_reviewer', document: kind })
    return new Response(new Uint8Array(pdf), { headers: documentHeaders(kind === 'rtw' ? 'right-to-work-document.pdf' : 'police-record.pdf') })
  } catch {
    console.error('[verification-review] File open failed')
    return Response.json({ error: 'Document unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
